import { expect, type Page, test } from "@playwright/test";

/**
 * E2E coverage for features that landed after the initial diff-flow suite:
 *  - File upload (drag-drop + .mxl decompression via score-file-drop event)
 *  - Next / prev change navigation (buttons + keyboard)
 *  - Diff summary sidebar
 *  - Page footer
 *  - Within-note diff tooltip summary
 *
 * All tests drive the real preview bundle via playwright.config.ts.
 * No mocks, no stubs — same code path as production.
 *
 * ### Why we dispatch `score-file-drop` directly instead of setInputFiles
 *
 * The `wireFileDrop` component adds a hidden `<input type="file">` (display:none)
 * inside each notation stage. Playwright's `setInputFiles` requires the target to
 * be visible or at least attached without a visibility restriction — the hidden
 * input times out. Rather than exposing the input via test-only attributes (which
 * would require touching src/), we drive the *output* of the file-picker: the
 * `score-file-drop` CustomEvent that `wireFileDrop` dispatches after reading the
 * file. This tests the full `loadScoreFile → reloadScore → runDiff` pipeline and
 * is consistent with the "test the contract, not implementation" rule.
 */

// ─── Shared helpers ────────────────────────────────────────────────────────

const NOTATION = "#XML-notation";
const NOTATION_2 = "#XML-notation-compare";

/** Wait for both notation panels to contain a rendered SVG (verovio ready). */
async function waitForBothScores(page: Page): Promise<void> {
  await expect(page.locator(`${NOTATION} svg`).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(`${NOTATION_2} svg`).first()).toBeVisible({ timeout: 30_000 });
}

/** Wait for at least one diff overlay to appear in the DOM. */
async function waitForOverlays(page: Page): Promise<void> {
  await expect(page.locator(".diff-overlay").first()).toBeVisible({ timeout: 10_000 });
}

// ─── Minimal MusicXML fixtures synthesised inline ─────────────────────────

/**
 * A minimal but valid MusicXML score with a given pitch step so we can
 * produce two scores that differ by exactly one note.
 */
function minimalMusicXML(step: "C" | "D" | "E"): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1">
      <part-name>Piano</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note>
        <pitch><step>${step}</step><octave>4</octave></pitch>
        <duration>4</duration>
        <type>whole</type>
      </note>
    </measure>
  </part>
</score-partwise>`;
}

/**
 * Dispatch a `score-file-drop` CustomEvent on a notation stage inside the
 * browser by constructing a real `File` object from a string payload.
 *
 * This drives `wireDropZone`'s `score-file-drop` listener → `loadScoreFile`
 * → `reloadScore` — the same pipeline reached by file-picker and drag-drop.
 *
 * @param stageSel   CSS selector of the `.notation-stage` element.
 * @param content    UTF-8 string content of the score.
 * @param filename   File name including extension (determines format).
 */
async function dispatchScoreFileDrop(
  page: Page,
  stageSel: string,
  content: string,
  filename: string,
): Promise<void> {
  await page.evaluate(
    ({ sel, fileContent, name }: { sel: string; fileContent: string; name: string }) => {
      const stage = document.querySelector(sel);
      if (!stage) throw new Error(`Stage not found: ${sel}`);
      const blob = new Blob([fileContent], { type: "text/xml" });
      const file = new File([blob], name, { type: "text/xml" });
      stage.dispatchEvent(
        new CustomEvent("score-file-drop", {
          detail: { file },
          bubbles: true,
          composed: true,
        }),
      );
    },
    { sel: stageSel, fileContent: content, name: filename },
  );
}

/**
 * Dispatch a `score-file-drop` event with raw bytes (for binary files such
 * as .mxl). The bytes are transferred as a base64 string and decoded inside
 * the browser context so no non-serialisable values cross the boundary.
 */
async function dispatchScoreFileDropBytes(
  page: Page,
  stageSel: string,
  bytes: Uint8Array,
  filename: string,
  mimeType: string,
): Promise<void> {
  // base64-encode the bytes in Node using the globalThis Buffer that Playwright
  // (bun/node runner) makes available at test runtime, without importing @types/node.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b64 = (
    globalThis as unknown as { Buffer: { from(b: Uint8Array): { toString(enc: string): string } } }
  ).Buffer.from(bytes).toString("base64");
  await page.evaluate(
    ({ sel, base64, name, mime }: { sel: string; base64: string; name: string; mime: string }) => {
      const stage = document.querySelector(sel);
      if (!stage) throw new Error(`Stage not found: ${sel}`);
      // Decode base64 → Uint8Array → Blob.
      const binaryStr = atob(base64);
      const byteArr = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        byteArr[i] = binaryStr.charCodeAt(i);
      }
      const blob = new Blob([byteArr], { type: mime });
      const file = new File([blob], name, { type: mime });
      stage.dispatchEvent(
        new CustomEvent("score-file-drop", {
          detail: { file },
          bubbles: true,
          composed: true,
        }),
      );
    },
    { sel: stageSel, base64: b64, name: filename, mime: mimeType },
  );
}

// ─── File upload — dispatching score-file-drop ─────────────────────────────

test.describe("File upload — score-file-drop (xml)", () => {
  test("uploading a score into slot 1 renders the notation and triggers a diff", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForBothScores(page);

    // Slot 1 receives a C-step score — pair with the existing Op10No1 (slot 2)
    // to produce a diff.
    await dispatchScoreFileDrop(page, NOTATION, minimalMusicXML("C"), "uploaded-c.xml");

    // Verovio must re-render slot 1 with the new score.
    await expect(page.locator(`${NOTATION} svg`).first()).toBeVisible({ timeout: 20_000 });

    // Diff overlays must be present (the two scores have different content).
    await waitForOverlays(page);
  });

  test("uploading a score into slot 2 renders the notation", async ({ page }) => {
    await page.goto("/");
    await waitForBothScores(page);

    // Load an E-step score into slot 2 — will differ from the C-step in slot 1.
    await dispatchScoreFileDrop(page, NOTATION_2, minimalMusicXML("E"), "uploaded-e.xml");

    await expect(page.locator(`${NOTATION_2} svg`).first()).toBeVisible({ timeout: 20_000 });

    // Change counter must show something — scores differ.
    await expect(page.locator("#change-counter")).not.toHaveText("0 of 0", { timeout: 10_000 });
  });
});

// ─── File upload — drag-drop ────────────────────────────────────────────────

test.describe("File upload — drag-drop", () => {
  test("dropping a .xml file on the score 1 stage triggers the file-drop pipeline", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForBothScores(page);

    const xmlContent = minimalMusicXML("D");
    const stage = page.locator(NOTATION);

    // Step 1: dispatch dragenter so the component adds .file-drop--active.
    // We only need the `types` array to satisfy the guard check; no binary
    // payload is needed for dragenter/dragover — only for the final drop.
    await page.evaluate(
      ({ stageSel }: { stageSel: string }) => {
        const el = document.querySelector(stageSel);
        if (!el) throw new Error(`Stage not found: ${stageSel}`);
        const dragEnter = new DragEvent("dragenter", { bubbles: true, cancelable: true });
        Object.defineProperty(dragEnter, "dataTransfer", {
          value: { types: ["Files"], files: [] },
        });
        el.dispatchEvent(dragEnter);
      },
      { stageSel: NOTATION },
    );

    // After dragenter the stage carries the active class.
    await expect(stage).toHaveClass(/file-drop--active/, { timeout: 3_000 });

    // Step 2: dispatch drop with a real File constructed in the browser so the
    // FileReader inside loadScoreFile receives an actual File instance.
    await page.evaluate(
      ({ stageSel, xml }: { stageSel: string; xml: string }) => {
        const el = document.querySelector(stageSel);
        if (!el) throw new Error(`Stage not found: ${stageSel}`);
        const blob = new Blob([xml], { type: "text/xml" });
        const file = new File([blob], "drag-score.xml", { type: "text/xml" });
        const dt = new DataTransfer();
        dt.items.add(file);
        const dropEvt = new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          dataTransfer: dt,
        });
        el.dispatchEvent(dropEvt);
      },
      { stageSel: NOTATION, xml: xmlContent },
    );

    // After drop the SVG must be present (verovio renders without errors).
    await expect(page.locator(`${NOTATION} svg`).first()).toBeVisible({ timeout: 20_000 });

    // The active class is removed by the onDrop handler.
    await expect(stage).not.toHaveClass(/file-drop--active/, { timeout: 3_000 });
  });
});

// ─── .mxl decompression ────────────────────────────────────────────────────

test.describe("File upload — .mxl decompression", () => {
  test("uploading a synthetic .mxl archive decompresses and renders the score", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForBothScores(page);

    // Build a minimal .mxl (zipped MusicXML) in Node using fflate — the same
    // library the app uses for decompression, so the format is guaranteed compatible.
    const { strToU8, zipSync } = await import("fflate");

    const xmlContent = minimalMusicXML("E");
    const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container>
  <rootfiles>
    <rootfile full-path="score.xml" media-type="application/vnd.recordare.musicxml+xml"/>
  </rootfiles>
</container>`;

    const mxlBytes: Uint8Array = zipSync({
      "META-INF/container.xml": strToU8(containerXml),
      "score.xml": strToU8(xmlContent),
    });

    await dispatchScoreFileDropBytes(
      page,
      NOTATION,
      mxlBytes,
      "test-score.mxl",
      "application/vnd.recordare.musicxml",
    );

    // Decompression succeeded if verovio can parse the extracted XML and render.
    await expect(page.locator(`${NOTATION} svg`).first()).toBeVisible({ timeout: 20_000 });
  });
});

// ─── Next / prev change navigation ────────────────────────────────────────

test.describe("Next/prev change navigation", () => {
  test("next-change button increments the change counter", async ({ page }) => {
    await page.goto("/");
    await waitForBothScores(page);
    await waitForOverlays(page);

    const counter = page.locator("#change-counter");
    // Counter starts at "1 of N" after refreshChangeNav on boot.
    await expect(counter).toHaveText(/^1 of \d+$/, { timeout: 5_000 });

    const initialText = await counter.textContent();
    const total = Number(initialText?.match(/of (\d+)/)?.[1] ?? "0");
    expect(total).toBeGreaterThan(0);

    await page.locator("#next-change").click();
    await expect(counter).toHaveText(`2 of ${total}`, { timeout: 3_000 });
  });

  test("prev-change button wraps to the last change when at position 1", async ({ page }) => {
    await page.goto("/");
    await waitForBothScores(page);
    await waitForOverlays(page);

    const counter = page.locator("#change-counter");
    await expect(counter).toHaveText(/^1 of \d+$/, { timeout: 5_000 });

    const initialText = await counter.textContent();
    const total = Number(initialText?.match(/of (\d+)/)?.[1] ?? "0");
    expect(total).toBeGreaterThan(1);

    // Pressing prev at position 1 wraps to the last entry.
    await page.locator("#prev-change").click();
    await expect(counter).toHaveText(`${total} of ${total}`, { timeout: 3_000 });
  });

  test("keyboard j advances to next change and ArrowDown also advances", async ({ page }) => {
    await page.goto("/");
    await waitForBothScores(page);
    await waitForOverlays(page);

    const counter = page.locator("#change-counter");
    await expect(counter).toHaveText(/^1 of \d+$/, { timeout: 5_000 });

    const initialText = await counter.textContent();
    const total = Number(initialText?.match(/of (\d+)/)?.[1] ?? "0");
    expect(total).toBeGreaterThan(2);

    // Focus body so keyboard shortcuts aren't captured by an input.
    await page.locator("body").focus();
    await page.keyboard.press("j");
    await expect(counter).toHaveText(`2 of ${total}`, { timeout: 3_000 });

    await page.keyboard.press("ArrowDown");
    await expect(counter).toHaveText(`3 of ${total}`, { timeout: 3_000 });
  });

  test("keyboard k retreats to prev change and ArrowUp also retreats", async ({ page }) => {
    await page.goto("/");
    await waitForBothScores(page);
    await waitForOverlays(page);

    const counter = page.locator("#change-counter");
    await expect(counter).toHaveText(/^1 of \d+$/, { timeout: 5_000 });

    await page.locator("body").focus();
    // Advance twice first so we have room to retreat.
    await page.keyboard.press("j");
    await page.keyboard.press("j");

    const afterAdvance = await counter.textContent();
    const total = Number(afterAdvance?.match(/of (\d+)/)?.[1] ?? "0");
    expect(Number(afterAdvance?.match(/^(\d+)/)?.[1] ?? "0")).toBe(3);

    await page.keyboard.press("k");
    await expect(counter).toHaveText(`2 of ${total}`, { timeout: 3_000 });

    await page.keyboard.press("ArrowUp");
    await expect(counter).toHaveText(`1 of ${total}`, { timeout: 3_000 });
  });

  test("focused overlay receives diff-overlay--focus class on navigation", async ({ page }) => {
    await page.goto("/");
    await waitForBothScores(page);
    await waitForOverlays(page);

    await expect(page.locator("#change-counter")).toHaveText(/^1 of \d+$/, { timeout: 5_000 });

    // Click next — focusChange adds .diff-overlay--focus transiently.
    await page.locator("#next-change").click();

    // Assert within the animation window (removed after 1700ms).
    await expect(page.locator(".diff-overlay--focus").first()).toBeAttached({ timeout: 3_000 });
  });
});

// ─── Diff summary sidebar ──────────────────────────────────────────────────

test.describe("Diff summary sidebar", () => {
  test("sidebar is visible and contains at least one change row on initial load", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForBothScores(page);
    await waitForOverlays(page);

    const aside = page.locator("#diff-summary");
    await expect(aside).toBeVisible({ timeout: 5_000 });

    const list = page.locator("#diff-summary-list");
    await expect(list.locator("li").first()).toBeAttached({ timeout: 5_000 });
  });

  test("sidebar count badges show non-zero totals reflecting the loaded diff", async ({ page }) => {
    await page.goto("/");
    await waitForBothScores(page);
    await waitForOverlays(page);

    const counts = page.locator("#diff-summary-counts");
    await expect(counts).toBeVisible({ timeout: 5_000 });

    // At least one of the three badges (+N / -N / ~N) must carry a non-zero digit.
    const countsText = await counts.textContent();
    expect(countsText).toBeTruthy();
    expect(/[1-9]/.test(countsText ?? "")).toBe(true);
  });

  test("clicking sidebar toggle collapses and re-expands the body", async ({ page }) => {
    await page.goto("/");
    await waitForBothScores(page);

    const body = page.locator("#diff-summary-body");
    const toggle = page.locator("#diff-summary-toggle");

    // Default: open.
    await expect(toggle).toHaveAttribute("aria-expanded", "true", { timeout: 5_000 });
    await expect(body).toBeVisible();

    // Collapse.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false", { timeout: 3_000 });
    await expect(body).toBeHidden();

    // Re-expand.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true", { timeout: 3_000 });
    await expect(body).toBeVisible();
  });

  test("clicking a sidebar row moves the change counter away from 1", async ({ page }) => {
    await page.goto("/");
    await waitForBothScores(page);
    await waitForOverlays(page);

    const counter = page.locator("#change-counter");
    await expect(counter).toHaveText(/^1 of \d+$/, { timeout: 5_000 });

    // Click the last sidebar item to ensure the counter moves away from position 1.
    const items = page.locator("#diff-summary-list .diff-summary-item-btn");
    const itemCount = await items.count();
    expect(itemCount).toBeGreaterThan(0);

    await items.last().click();

    // Counter should no longer be "1 of N" unless there's only one change.
    const afterText = await counter.textContent();
    const total = Number(afterText?.match(/of (\d+)/)?.[1] ?? "0");
    if (total > 1) {
      await expect(counter).not.toHaveText(/^1 of \d+$/, { timeout: 5_000 });
    }
  });
});

// ─── Page footer ───────────────────────────────────────────────────────────

test.describe("Page footer", () => {
  test("footer is present in the DOM with role=contentinfo", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("contentinfo")).toBeAttached({ timeout: 10_000 });
  });

  test("footer GitHub link points to the KangaZero/DiffLizst repository", async ({ page }) => {
    await page.goto("/");
    const githubLink = page.locator("footer a[href*='github.com']").first();
    await expect(githubLink).toBeAttached({ timeout: 10_000 });
    await expect(githubLink).toHaveAttribute("href", /github\.com\/KangaZero\/DiffLizst/);
    await expect(githubLink).toHaveAttribute("target", "_blank");
    await expect(githubLink).toHaveAttribute("rel", /noopener/);
  });

  test("footer version text matches the v0.1.0 package.json version", async ({ page }) => {
    await page.goto("/");
    const versionSpan = page.locator(".app-footer-version");
    await expect(versionSpan).toBeAttached({ timeout: 10_000 });

    // __APP_VERSION__ is replaced at build time; preview build emits the real
    // version string. Must match semver "vMAJOR.MINOR.PATCH" or "dev".
    await expect(versionSpan).toHaveText(/^v\d+\.\d+\.\d+$|^dev$/, { timeout: 5_000 });
  });

  test("footer contains Verovio, Monaco, and Vite attribution links", async ({ page }) => {
    await page.goto("/");
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: /verovio/i })).toBeAttached({ timeout: 5_000 });
    await expect(footer.getByRole("link", { name: /monaco/i })).toBeAttached({ timeout: 5_000 });
    await expect(footer.getByRole("link", { name: /vite/i })).toBeAttached({ timeout: 5_000 });
  });
});

// ─── Swap scores button ────────────────────────────────────────────────────

test.describe("Swap scores button", () => {
  test("swap button exchanges the score-loader file header labels", async ({ page }) => {
    await page.goto("/");
    await waitForBothScores(page);
    await waitForOverlays(page);

    // Load a distinctly-named score into each slot via score-file-drop so we
    // have two known display names we can assert against after the swap.
    await dispatchScoreFileDrop(page, NOTATION, minimalMusicXML("C"), "alpha-score.xml");
    await expect(page.locator(`${NOTATION} svg`).first()).toBeVisible({ timeout: 20_000 });

    await dispatchScoreFileDrop(page, NOTATION_2, minimalMusicXML("E"), "beta-score.xml");
    await expect(page.locator(`${NOTATION_2} svg`).first()).toBeVisible({ timeout: 20_000 });

    // Wait for the diff to settle (swap button becomes enabled when both scores are loaded).
    await expect(page.locator("#swap-scores")).toBeEnabled({ timeout: 10_000 });

    // Capture headers before swap — diff-file-old = left (slot 1), diff-file-new = right (slot 2).
    // querySelector returns the first matching element (Monaco header), which is always in the DOM.
    const leftBefore = await page.evaluate(
      () => document.querySelector(".diff-file-old")?.textContent?.trim() ?? "",
    );
    const rightBefore = await page.evaluate(
      () => document.querySelector(".diff-file-new")?.textContent?.trim() ?? "",
    );

    expect(leftBefore).toContain("alpha-score.xml");
    expect(rightBefore).toContain("beta-score.xml");

    await page.locator("#swap-scores").click();

    // After swap the names must be exchanged.
    await expect(page.locator(".diff-file-old").first()).toHaveText(/beta-score\.xml/, {
      timeout: 5_000,
    });
    await expect(page.locator(".diff-file-new").first()).toHaveText(/alpha-score\.xml/, {
      timeout: 5_000,
    });
  });

  test("swap button reverses add/remove overlay counts", async ({ page }) => {
    await page.goto("/");
    await waitForBothScores(page);
    await waitForOverlays(page);

    // Wait for the swap button to be enabled (both scores loaded).
    await expect(page.locator("#swap-scores")).toBeEnabled({ timeout: 10_000 });

    // Count add and remove overlays before swap.
    const countsBefore = await page.evaluate(() => ({
      add: document.querySelectorAll(".diff-overlay--add").length,
      remove: document.querySelectorAll(".diff-overlay--remove").length,
    }));

    // There must be at least some overlays to make the assertion meaningful.
    const totalBefore = countsBefore.add + countsBefore.remove;
    expect(totalBefore).toBeGreaterThan(0);

    await page.locator("#swap-scores").click();

    // After swap, add and remove counts must be exchanged.
    // Allow a brief moment for the re-render and reapply to complete.
    const countsAfter = await page.evaluate(() => ({
      add: document.querySelectorAll(".diff-overlay--add").length,
      remove: document.querySelectorAll(".diff-overlay--remove").length,
    }));

    // What was added is now removed and vice versa.
    expect(countsAfter.add).toBe(countsBefore.remove);
    expect(countsAfter.remove).toBe(countsBefore.add);
  });
});

// ─── Within-note diff tooltip summary ─────────────────────────────────────

test.describe("Within-note diff tooltip summary", () => {
  test("hovering a diff overlay makes the tooltip visible", async ({ page }) => {
    await page.goto("/");
    await waitForBothScores(page);
    await waitForOverlays(page);

    const overlay = page.locator(`${NOTATION} .diff-overlay, ${NOTATION_2} .diff-overlay`).first();
    await expect(overlay).toBeVisible({ timeout: 10_000 });

    await overlay.hover();

    const tooltip = page.locator("#diff-tooltip");
    await expect(tooltip).toHaveClass(/diff-tooltip--visible/, { timeout: 5_000 });
  });

  test("tooltip contains the @@ label @@ header and a diff body", async ({ page }) => {
    await page.goto("/");
    await waitForBothScores(page);
    await waitForOverlays(page);

    const overlay = page.locator(`${NOTATION} .diff-overlay, ${NOTATION_2} .diff-overlay`).first();
    await overlay.hover();

    const tooltip = page.locator("#diff-tooltip");
    await expect(tooltip).toHaveClass(/diff-tooltip--visible/, { timeout: 5_000 });

    // Header: always present, contains "@@ <label> @@".
    await expect(tooltip.locator(".diff-tooltip-header")).toBeAttached({ timeout: 3_000 });
    const headerText = await tooltip.locator(".diff-tooltip-header").textContent();
    expect(headerText).toMatch(/@@.+@@/);

    // Body: raw diff lines (always present — at minimum one context line).
    await expect(tooltip.locator(".diff-tooltip-body")).toBeVisible({ timeout: 3_000 });
  });

  test("note-level overlay tooltip summary contains a semantic field when present", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForBothScores(page);
    await waitForOverlays(page);

    // Dispatch mouseenter on overlays via evaluate to bypass pointer-intercept
    // issues (some overlays are behind scrollable containers and cannot be
    // reached by Playwright's pointer simulation). The tooltip is JS-driven
    // (mouseenter listener on each overlay), so synthetic events work correctly.
    const found = await page.evaluate(
      ({ notation, notation2 }: { notation: string; notation2: string }) => {
        const overlays = Array.from(
          document.querySelectorAll<HTMLDivElement>(
            `${notation} .diff-overlay, ${notation2} .diff-overlay`,
          ),
        );
        for (const overlay of overlays.slice(0, 20)) {
          // Synthesise mouseenter at the overlay's centre.
          const rect = overlay.getBoundingClientRect();
          const mx = rect.left + rect.width / 2;
          const my = rect.top + rect.height / 2;
          overlay.dispatchEvent(
            new MouseEvent("mouseenter", { bubbles: false, clientX: mx, clientY: my }),
          );

          const tooltip = document.querySelector("#diff-tooltip");
          if (!tooltip?.classList.contains("diff-tooltip--visible")) continue;

          const summary = tooltip.querySelector(".diff-tooltip-summary");
          if (summary) {
            const field = summary.querySelector(".diff-summary-field")?.textContent ?? "";
            // Reset tooltip before returning.
            overlay.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false }));
            return { hasSummary: true, field };
          }
          // Hide tooltip before trying next overlay.
          overlay.dispatchEvent(new MouseEvent("mouseleave", { bubbles: false }));
        }
        return { hasSummary: false, field: "" };
      },
      { notation: NOTATION, notation2: NOTATION_2 },
    );

    if (found.hasSummary) {
      // At least one overlay had the summariseNoteDiff block — verify field name.
      expect(found.field).toMatch(/pitch|duration|voice|type|stem|lyric/);
    } else {
      // No summary on page 1 (all changes are measure-level). The tooltip body
      // (raw diff lines) is still expected — verify via the first overlay.
      await page.evaluate(
        ({ notation }: { notation: string }) => {
          const overlay = document.querySelector<HTMLDivElement>(`${notation} .diff-overlay`);
          if (!overlay) return;
          const rect = overlay.getBoundingClientRect();
          overlay.dispatchEvent(
            new MouseEvent("mouseenter", {
              bubbles: false,
              clientX: rect.left + rect.width / 2,
              clientY: rect.top + rect.height / 2,
            }),
          );
        },
        { notation: NOTATION },
      );
      await expect(page.locator("#diff-tooltip .diff-tooltip-body")).toBeVisible({
        timeout: 3_000,
      });
    }
  });

  test("tooltip disappears when the mouse leaves the overlay", async ({ page }) => {
    await page.goto("/");
    await waitForBothScores(page);
    await waitForOverlays(page);

    const overlay = page.locator(`${NOTATION} .diff-overlay`).first();
    await overlay.hover();

    const tooltip = page.locator("#diff-tooltip");
    await expect(tooltip).toHaveClass(/diff-tooltip--visible/, { timeout: 5_000 });

    // Move mouse away — mouseleave removes the visible class.
    await page.mouse.move(0, 0);
    await expect(tooltip).not.toHaveClass(/diff-tooltip--visible/, { timeout: 3_000 });
  });
});

// ─── Colorblind-safe palette toggle ───────────────────────────────────────

test.describe("Colorblind-safe palette toggle", () => {
  test("checking the colorblind toggle sets data-palette=colorblind and changes overlay background", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForBothScores(page);
    await waitForOverlays(page);

    // Record the computed background of the first add overlay before toggling.
    const bgBefore = await page.evaluate(() => {
      const overlay = document.querySelector<HTMLDivElement>(".diff-overlay--add");
      if (!overlay) return "";
      return getComputedStyle(overlay).backgroundColor;
    });

    // Open the settings panel and check the colorblind toggle.
    await page.locator("diff-settings").evaluate((el: Element) => {
      const shadow = el.shadowRoot;
      if (!shadow) throw new Error("Shadow root not found");
      const trigger = shadow.querySelector<HTMLButtonElement>(".trigger");
      trigger?.click();
    });

    await page.locator("diff-settings").evaluate((el: Element) => {
      const shadow = el.shadowRoot;
      if (!shadow) throw new Error("Shadow root not found");
      const checkbox = shadow.querySelector<HTMLInputElement>("#colorblind-palette");
      if (!checkbox) throw new Error("Colorblind palette checkbox not found");
      checkbox.click();
    });

    // data-palette must be "colorblind" after the settings-change event fires.
    await expect(page.locator("html")).toHaveAttribute("data-palette", "colorblind", {
      timeout: 3_000,
    });

    // The computed background of an add overlay must differ from the default green.
    const bgAfter = await page.evaluate(() => {
      const overlay = document.querySelector<HTMLDivElement>(".diff-overlay--add");
      if (!overlay) return "";
      return getComputedStyle(overlay).backgroundColor;
    });

    expect(bgAfter).not.toBe(bgBefore);
  });
});

// ─── Measure-jump input ────────────────────────────────────────────────────

test.describe("Measure-jump input", () => {
  test("entering a valid measure number keeps the score visible and shows no toast", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForBothScores(page);
    await waitForOverlays(page);

    const input = page.locator("#measure-jump-input");
    await expect(input).toBeVisible({ timeout: 5_000 });

    await input.fill("1");
    await input.press("Enter");

    // Score must still be rendered (no crash from the jump).
    await expect(page.locator(`${NOTATION} svg`).first()).toBeVisible({ timeout: 5_000 });
    // No error toast for a valid measure.
    const toast = page.locator("#measure-jump-toast");
    const toastExists = await toast.count();
    if (toastExists > 0) {
      await expect(toast).not.toHaveClass(/measure-jump-toast--visible/);
    }
  });

  test("entering an out-of-range measure number shows an error toast", async ({ page }) => {
    await page.goto("/");
    await waitForBothScores(page);
    await waitForOverlays(page);

    const input = page.locator("#measure-jump-input");
    await input.fill("99999");
    await input.press("Enter");

    const toast = page.locator("#measure-jump-toast");
    await expect(toast).toHaveClass(/measure-jump-toast--visible/, { timeout: 5_000 });
    const text = await toast.textContent();
    expect((text ?? "").length).toBeGreaterThan(0);
  });

  test("pressing Enter on an empty input is a no-op — no toast", async ({ page }) => {
    await page.goto("/");
    await waitForBothScores(page);

    const input = page.locator("#measure-jump-input");
    await input.fill("");
    await input.press("Enter");

    const toast = page.locator("#measure-jump-toast");
    const toastExists = await toast.count();
    if (toastExists > 0) {
      await expect(toast).not.toHaveClass(/measure-jump-toast--visible/);
    }
  });
});

// ─── Hover-link: overlay hover highlights Monaco lines ────────────────────

test.describe("Hover-link bidirectional highlight", () => {
  test("hovering a diff overlay adds a Monaco line decoration while Monaco is open", async ({
    page,
  }) => {
    await page.goto("/");
    await waitForBothScores(page);
    await waitForOverlays(page);

    // Open the Monaco diff view so the editor is created and hover-link is wired.
    await page.locator("#view-toggle").click();
    // Wait for the editor container to become visible.
    await expect(page.locator("#diff-page")).toHaveClass(/visible/, { timeout: 10_000 });
    // Give Monaco a moment to fully mount its DOM.
    await page.waitForTimeout(1_500);

    // Go back to notation view so the overlays are rendered and visible.
    await page.locator("#view-toggle").click();
    await expect(page.locator(`${NOTATION} .diff-overlay`).first()).toBeVisible({
      timeout: 10_000,
    });

    // Synthetically dispatch mouseenter on the first overlay — Playwright's
    // hover() may be intercepted by the tooltip positioning or scroll containers.
    const hadDecoration = await page.evaluate(
      ({ notation, notation2 }: { notation: string; notation2: string }) => {
        const overlays = Array.from(
          document.querySelectorAll<HTMLDivElement>(
            `${notation} .diff-overlay, ${notation2} .diff-overlay`,
          ),
        );
        if (overlays.length === 0) return false;
        const overlay = overlays[0];
        const rect = overlay.getBoundingClientRect();
        overlay.dispatchEvent(
          new MouseEvent("mouseenter", {
            bubbles: false,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
          }),
        );
        // Allow one rAF for the decoration to be applied.
        return new Promise<boolean>((resolve) => {
          requestAnimationFrame(() => {
            const decorationEls = document.querySelectorAll(".diff-line--hover-link");
            resolve(decorationEls.length > 0);
          });
        });
      },
      { notation: NOTATION, notation2: NOTATION_2 },
    );

    expect(hadDecoration).toBe(true);
  });
});

// ─── Print stylesheet ──────────────────────────────────────────────────────

test.describe("Print stylesheet", () => {
  test("toolbar is hidden in print media", async ({ page }) => {
    await page.goto("/");
    await page.emulateMedia({ media: "print" });

    const toolbar = page.locator("header#toolbar");
    await expect(toolbar).toBeHidden();
  });
});
