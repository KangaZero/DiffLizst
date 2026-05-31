import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the DiffLizst e2e suite.
 *
 * Drives the actual built web app via `bun run preview`, not the dev server,
 * so production-shape bundles are exercised. Base path matches Vite's
 * `base: '/DiffLizst/'` setting.
 *
 * Browser matrix: chromium-only by default. The matrix is structured so
 * adding firefox + webkit later is one line per project.
 *
 * Run locally: `bun run test:e2e:install` once, then `bun run test:e2e`.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // Fail the build on CI if `test.only` was left in source.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "html",
  use: {
    baseURL: "http://localhost:4173/DiffLizst/",
    // Capture diagnostic artifacts on retry / failure but not happy-path runs.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Uncomment to opt into a wider browser matrix.
    // { name: "firefox",  use: { ...devices["Desktop Firefox"]  } },
    // { name: "webkit",   use: { ...devices["Desktop Safari"]   } },
  ],
  webServer: {
    command: "bun run build && bun run preview --port 4173",
    url: "http://localhost:4173/DiffLizst/",
    reuseExistingServer: !process.env.CI,
    // verovio WASM is large; give the build + preview enough headroom.
    timeout: 120_000,
  },
});
