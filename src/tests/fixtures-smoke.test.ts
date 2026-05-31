/**
 * Smoke suite for the real-world MusicXML fixture set.
 *
 * For every fixture in `tests/fixtures/musicxml-real/`:
 *   1. Parses it with the same DOMParser shim the runtime uses, and asserts
 *      the root element is `<score-partwise>` or `<score-timewise>`.
 *   2. Diffs the file against itself with the project's default options and
 *      asserts the diff is empty — any non-empty result here means the
 *      LCS pipeline disagrees with the input it just parsed, which is a
 *      regression in either the parser shim or `diffXML` itself.
 *
 * The fixture set is curated in `scripts/fetch-fixtures.ts` and covers
 * tied notes, tuplets, repeats, voltas, drumset, tablature, multi-voice,
 * chord symbols, ornaments, etc. — features the synthetic unit suite
 * doesn't exercise.
 *
 * Run with: `pnpm vitest run src/tests/fixtures-smoke.test.ts`
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { diffXML, type XMLDiffOptions } from "@/utils/diffXML";

const FIXTURE_DIR = fileURLToPath(new URL("../../tests/fixtures/musicxml-real/", import.meta.url));

const FIXTURE_EXTENSIONS = new Set([".musicxml", ".xml"]);

const VALID_ROOTS = new Set(["score-partwise", "score-timewise"]);

const DEFAULT_DIFF_OPTIONS: XMLDiffOptions = {
  contextLines: 2,
  ignoreWhitespace: true,
  algorithm: "patience",
  detailedDiff: false,
};

/**
 * Synchronous read at module-load time so each fixture can be its own
 * named `it(...)` case in the bun-test runner. Async discovery would
 * push everything into a single `it(...)` and lose the per-file signal.
 */
function discoverFixtures(): string[] {
  return readdirSync(FIXTURE_DIR)
    .filter((name) => {
      const dot = name.lastIndexOf(".");
      if (dot < 0) return false;
      return FIXTURE_EXTENSIONS.has(name.slice(dot).toLowerCase());
    })
    .sort();
}

const fixtures = discoverFixtures();

describe("musicxml-real fixtures", () => {
  it("has at least one fixture to exercise", () => {
    // Guard rails: a regression in the fetch script (or someone deleting
    // the corpus) shouldn't quietly turn this whole suite into a no-op.
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const file of fixtures) {
    describe(file, () => {
      it("parses with a valid MusicXML root element", () => {
        const xml = readFileSync(`${FIXTURE_DIR}${file}`, "utf-8");
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        const root = doc.documentElement?.nodeName;
        expect(root).toBeDefined();
        expect(VALID_ROOTS.has(root as string)).toBe(true);
      });

      it("self-diff yields zero changes", () => {
        const xml = readFileSync(`${FIXTURE_DIR}${file}`, "utf-8");
        const result = diffXML(xml, xml, DEFAULT_DIFF_OPTIONS);
        expect(result.measures.size).toBe(0);
        expect(result.credits.size).toBe(0);
        expect(result.partLists.size).toBe(0);
        expect(result.children.size).toBe(0);
      });
    });
  }
});
