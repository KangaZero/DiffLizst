import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * Smoke test for the published library build.
 *
 * The web app and the library share a single source tree; this test pins
 * that `bun run build:lib` produces an importable ES module exposing
 * `diffXML` and that the bundled .d.ts matches the runtime shape.
 *
 * It uses a Playwright `test()` only for the test runner (no browser);
 * the actual call runs in Node. Playwright's runner gives us consistent
 * reporting alongside the e2e suite.
 *
 * The test depends on `dist-lib/lib.js` and `dist-lib/lib.d.ts` existing —
 * the `webServer.command` in playwright.config.ts runs `pnpm run build`
 * which only produces the web bundle. So this spec triggers `build:lib`
 * before its first assertion.
 */

test.describe("library export", () => {
  test.beforeAll(async () => {
    const { execSync } = await import("node:child_process");
    execSync("pnpm run build:lib", {
      cwd: fileURLToPath(new URL("../..", import.meta.url)),
      stdio: "inherit",
    });
  });

  test("dist-lib/lib.js exports diffXML and runs on a real DOM", async () => {
    // Polyfill DOMParser the same way `src/tests/setup.ts` does — required
    // because the library is browser-native but we're running under Node.
    const { DOMParser } = await import("linkedom");
    Object.assign(globalThis, {
      DOMParser,
      XMLSerializer: class {
        serializeToString(node: unknown): string {
          return (node as { toString(): string }).toString();
        }
      },
    });

    const libUrl = new URL("../../dist-lib/lib.js", import.meta.url);
    const mod = (await import(libUrl.href)) as {
      diffXML: (xml1: string, xml2: string, opts: unknown) => unknown;
    };

    expect(typeof mod.diffXML).toBe("function");

    const xml1 = `<?xml version="1.0"?>
<score-partwise><part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list>
<part id="P1"><measure number="1"><note><pitch><step>C</step></pitch></note></measure></part>
</score-partwise>`;
    const xml2 = `<?xml version="1.0"?>
<score-partwise><part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list>
<part id="P1"><measure number="1"><note><pitch><step>D</step></pitch></note></measure></part>
</score-partwise>`;

    const result = mod.diffXML(xml1, xml2, {
      contextLines: 2,
      ignoreWhitespace: true,
      algorithm: "patience",
      detailedDiff: false,
    }) as { measures: Map<number, unknown> };

    expect(result.measures.size).toBe(1);
  });

  test("dist-lib/lib.d.ts re-exports the public API surface", async () => {
    const dtsUrl = new URL("../../dist-lib/lib.d.ts", import.meta.url);
    const dts = await readFile(fileURLToPath(dtsUrl), "utf-8");

    // The bundled .d.ts must mention every named export we promised in lib.ts.
    expect(dts).toContain("diffXML");
    expect(dts).toContain("XMLDiffOptions");
    expect(dts).toContain("XMLDiffResult");
    expect(dts).toContain("ElementDiff");
    expect(dts).toContain("DiffLine");
    expect(dts).toContain("ChildDiffKey");
    expect(dts).toContain("ChangeType");
  });
});
