import { readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";

/**
 * Two build modes share one config.
 *
 * - Default mode (`vite build`)  → web app for GitHub Pages, served from `/DiffLizst/`.
 * - `--mode lib` (`vite build --mode lib`) → standalone diff-core library to `dist-lib/`.
 *
 * Library mode emits .d.ts via `vite-plugin-dts` and keeps verovio + monaco-editor
 * external — they're app-level concerns, not library concerns.
 */

/**
 * Read package.json once and expose the version string to the app shell via
 * Vite's `define`. Beats hard-coding the version in two places (or pulling
 * `package.json` in at runtime, which inflates the bundle).
 */
function readPackageVersion(): string {
  try {
    const pkg: unknown = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf-8"));
    if (pkg && typeof pkg === "object" && "version" in pkg && typeof pkg.version === "string") {
      return pkg.version;
    }
  } catch {
    // Fall through to "dev".
  }
  return "dev";
}

export default defineConfig(({ mode }) => {
  const alias = { "@": path.resolve(__dirname, "src") };
  const appVersion = readPackageVersion();

  if (mode === "lib") {
    return {
      resolve: { alias },
      // No `publicDir` for the library build — we don't want the web app's
      // favicon and icons copied alongside the .js artifact.
      publicDir: false,
      plugins: [
        dts({
          include: ["src/lib.ts", "src/utils/diffXML.ts"],
          rollupTypes: true,
          outDir: "dist-lib",
          // Flatten the bundled .d.ts to `dist-lib/lib.d.ts` (matches
          // `package.json`'s `types` field), not `dist-lib/src/lib.d.ts`.
          entryRoot: "src",
        }),
      ],
      build: {
        outDir: "dist-lib",
        emptyOutDir: true,
        sourcemap: true,
        lib: {
          entry: path.resolve(__dirname, "src/lib.ts"),
          formats: ["es"],
          fileName: () => "lib.js",
        },
        rollupOptions: {
          // Library consumers bring their own DOMParser (browser-native).
          // We don't bundle browser globals.
          external: [],
        },
      },
    };
  }

  return {
    base: "/DiffLizst/",
    resolve: { alias },
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
    },
  };
});
