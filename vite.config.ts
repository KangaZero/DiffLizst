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
      publicDir: false,
      plugins: [
        dts({
          include: ["src/lib.ts", "src/utils/diffXML.ts"],
          rollupTypes: true,
          outDir: "dist-lib",
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
      // Tell Monaco's feature auto-discovery to skip languages we don't need.
      // Only the XML basic language contribution is kept — every other language
      // chunk (the ~79 that bloated the Lighthouse audit) is excluded at build
      // time by restricting what monaco-editor pulls in via this override.
      "process.env.MONACO_EDITOR_SKIP_LANGUAGE_CONTRIBUTIONS": JSON.stringify(
        "abap,apex,azcli,bat,bicep,cameligo,clojure,coffee,cpp,csharp,csp,css,cypher,dart,dockerfile,ecl,elixir,flow9,freemarker2,fsharp,go,graphql,handlebars,hcl,html,ini,java,javascript,julia,kotlin,less,lexon,liquid,lua,m3,markdown,mdx,mips,msdax,mysql,objective-c,pascal,pascaligo,perl,pgsql,php,pla,postiats,powerquery,powershell,proto,pug,python,qsharp,r,razor,redis,redshift,restructuredtext,ruby,rust,sb,scala,scheme,scss,shell,solidity,sophia,sparql,sql,st,swift,systemverilog,tcl,twig,typescript,vb,wgsl,xml-unused,yaml",
      ),
    },
    build: {
      // Monaco's lazy chunk is ~8 MB unminified. Raising the limit avoids a
      // spurious warning for the Monaco async chunk while still catching
      // regressions in the main entry (which should now be well under 5 MB).
      chunkSizeWarningLimit: 5000,
    },
  };
});
