import { expect, test } from "@playwright/test";

/**
 * PWA installation and offline-capability smoke tests.
 *
 * All tests run against the built preview bundle via playwright.config.ts.
 * The service worker only registers in a real HTTPS or localhost context —
 * `vite preview` on localhost satisfies this requirement.
 */

test.describe("PWA — service worker registration", () => {
  test("service worker registers and reaches activated state", async ({ page }) => {
    await page.goto("/");

    const swState = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return registration.active?.state ?? "no-active-worker";
    });

    expect(swState).toBe("activated");
  });
});

test.describe("PWA — web manifest", () => {
  test("manifest endpoint responds 200 with a manifest content-type", async ({ request }) => {
    const response = await request.get("/DiffLizst/manifest.webmanifest");
    expect(response.status()).toBe(200);

    const contentType = response.headers()["content-type"] ?? "";
    const isManifestType =
      contentType.includes("application/manifest+json") || contentType.includes("application/json");
    expect(isManifestType).toBe(true);
  });

  test("manifest contains required PWA fields", async ({ request }) => {
    const response = await request.get("/DiffLizst/manifest.webmanifest");
    const manifest: unknown = await response.json();

    expect(manifest).toMatchObject({
      name: "DiffLizst",
      short_name: "DiffLizst",
      display: "standalone",
      start_url: "/DiffLizst/",
      scope: "/DiffLizst/",
    });
  });

  test("every icon URL declared in the manifest responds 200", async ({ request }) => {
    const response = await request.get("/DiffLizst/manifest.webmanifest");
    const manifest = (await response.json()) as { icons?: Array<{ src: string }> };

    const icons = manifest.icons ?? [];
    expect(icons.length).toBeGreaterThan(0);

    for (const icon of icons) {
      const iconUrl = icon.src.startsWith("/") ? icon.src : `/DiffLizst/${icon.src}`;
      const iconResponse = await request.get(iconUrl);
      expect(iconResponse.status(), `icon ${icon.src} should respond 200`).toBe(200);
    }
  });
});

test.describe("PWA — offline capability", () => {
  test("app shell renders after going offline following a warm visit", async ({
    page,
    context,
  }) => {
    await page.goto("/");

    // Wait for both notation panels — confirms the app shell and Verovio are loaded.
    await expect(page.locator("#XML-notation svg").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("#XML-notation-compare svg").first()).toBeVisible({
      timeout: 30_000,
    });

    // Simulate offline. The SW's precache should serve the app shell from cache.
    await context.setOffline(true);

    await page.reload();

    // Both panels must still be present — the app shell (HTML + JS) is served from SW cache.
    await expect(page.locator("#XML-notation")).toBeAttached({ timeout: 15_000 });
    await expect(page.locator("#XML-notation-compare")).toBeAttached({ timeout: 15_000 });

    await context.setOffline(false);
  });
});
