import { expect, test } from "@playwright/test";

/**
 * End-to-end suite for the DiffLizst web app.
 *
 * These tests drive the real built bundle via `bun run preview` (see
 * `playwright.config.ts`), so they exercise the same code path that ships
 * to GitHub Pages. They deliberately do not stub verovio, monaco, or the
 * score fixtures — the whole point of e2e is the integration is real.
 *
 * Readiness signal: the app boots verovio WASM asynchronously; once it's
 * loaded, `#XML-notation` and `#XML-notation-compare` contain an `<svg>`
 * element. That's the cheapest, most stable indicator the boot succeeded.
 */

const NOTATION = "#XML-notation";
const NOTATION_2 = "#XML-notation-compare";

/** Wait for both notation panels to contain an SVG — i.e. verovio finished.
 *  Verovio nests an inner `<svg class="definition-scale">` so `${selector} svg`
 *  matches 2 elements; use `.first()` to stay out of strict-mode violations.
 */
async function waitForBothScores(page: import("@playwright/test").Page): Promise<void> {
  await expect(page.locator(`${NOTATION} svg`).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(`${NOTATION_2} svg`).first()).toBeVisible({ timeout: 30_000 });
}

test.describe("DiffLizst — full flow", () => {
  test("boots, renders both scores, and shows diff overlays", async ({ page }) => {
    await page.goto("/");
    await waitForBothScores(page);

    // At least one diff overlay must appear on the initial Chopin/Chopin pair.
    // The selectors `.diff-overlay` are produced by applyDiffHighlights.
    await expect(page.locator(".diff-overlay").first()).toBeVisible({ timeout: 10_000 });
  });

  test("monaco view toggle reveals the diff editor", async ({ page }) => {
    await page.goto("/");
    await waitForBothScores(page);

    // Monaco view is OFF by default — the section is in the DOM but doesn't
    // have the `.visible` class.
    const diffPage = page.locator("#diff-page");
    await expect(diffPage).not.toHaveClass(/\bvisible\b/);

    await page.locator("#view-toggle").click();
    await expect(diffPage).toHaveClass(/\bvisible\b/);

    // Monaco lazily mounts inside #diff-editor-container; assert that the
    // diff-editor surface is attached. Monaco hides some of its own internal
    // gutters, so we look for the parent diff-editor container which is what
    // the user actually sees.
    await expect(page.locator("#diff-editor-container .monaco-diff-editor")).toBeAttached({
      timeout: 15_000,
    });
  });

  test("git-diff view toggle reveals hunks", async ({ page }) => {
    await page.goto("/");
    await waitForBothScores(page);

    const gitDiffPage = page.locator("#git-diff-page");
    await expect(gitDiffPage).not.toHaveClass(/\bvisible\b/);

    await page.locator("#git-diff-toggle").click();
    await expect(gitDiffPage).toHaveClass(/\bvisible\b/);

    // The hunks container is populated by renderGitDiffPage. It must contain
    // at least one child element when there are real diffs.
    const hunks = page.locator("#git-diff-hunks");
    await expect(hunks).toBeVisible();
    await expect(hunks.locator("*").first()).toBeAttached({ timeout: 5_000 });
  });

  test("scale slider rescales without breaking overlays", async ({ page }) => {
    await page.goto("/");
    await waitForBothScores(page);

    const initialOverlays = await page.locator(".diff-overlay").count();
    expect(initialOverlays).toBeGreaterThan(0);

    // Bump shared scale via direct input event — sliders are awkward to
    // simulate with mouse, and fillable input gives stable values.
    await page.locator("#notation-scale").evaluate((el: HTMLInputElement) => {
      el.value = "120";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // Verovio re-renders synchronously, but the SVG swap is in the same tick.
    // Wait briefly for overlays to be re-applied.
    await page.waitForFunction(
      (selector) => document.querySelectorAll(selector).length > 0,
      ".diff-overlay",
      { timeout: 5_000 },
    );
    const rescaledOverlays = await page.locator(".diff-overlay").count();
    expect(rescaledOverlays).toBeGreaterThan(0);
  });

  test("toggling Monaco then git-diff cycles views correctly", async ({ page }) => {
    await page.goto("/");
    await waitForBothScores(page);

    const monacoBtn = page.locator("#view-toggle");
    const gitDiffBtn = page.locator("#git-diff-toggle");
    const diffPage = page.locator("#diff-page");
    const gitDiffPage = page.locator("#git-diff-page");

    // Start: nothing on.
    await expect(diffPage).not.toHaveClass(/\bvisible\b/);
    await expect(gitDiffPage).not.toHaveClass(/\bvisible\b/);

    // Monaco on.
    await monacoBtn.click();
    await expect(diffPage).toHaveClass(/\bvisible\b/);
    await expect(gitDiffPage).not.toHaveClass(/\bvisible\b/);

    // Git-diff on, Monaco off (mutually exclusive via switchView).
    await gitDiffBtn.click();
    await expect(diffPage).not.toHaveClass(/\bvisible\b/);
    await expect(gitDiffPage).toHaveClass(/\bvisible\b/);

    // Click git-diff again to toggle off.
    await gitDiffBtn.click();
    await expect(gitDiffPage).not.toHaveClass(/\bvisible\b/);
  });

  test("diff settings change re-renders without errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/");
    await waitForBothScores(page);

    // Open the diff-settings panel by clicking its trigger inside shadow DOM.
    // The custom element is `<diff-settings>` and has its own shadow root.
    const diffSettings = page.locator("diff-settings");
    await diffSettings.evaluate((el: HTMLElement & { shadowRoot: ShadowRoot | null }) => {
      const trigger = el.shadowRoot?.querySelector<HTMLButtonElement>(".trigger");
      trigger?.click();
    });

    // Bump contextLines via the shadow-DOM input.
    await diffSettings.evaluate((el: HTMLElement & { shadowRoot: ShadowRoot | null }) => {
      const input = el.shadowRoot?.querySelector<HTMLInputElement>("#ctx-lines");
      if (!input) throw new Error("ctx-lines input missing");
      input.value = "5";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    // Overlays should still be present after the re-diff.
    await expect(page.locator(".diff-overlay").first()).toBeVisible({ timeout: 5_000 });

    // Filter known-noisy logs (verovio sometimes warns about missing fonts in
    // a headless context — that's not a regression, just a CI environment trait).
    const realErrors = consoleErrors.filter(
      (msg) =>
        !msg.includes("verovio") &&
        !msg.includes("WebAssembly") &&
        !msg.includes("Failed to load resource"),
    );
    expect(realErrors).toEqual([]);
  });
});
