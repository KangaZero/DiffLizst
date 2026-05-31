/**
 * Integration coverage for `diffXML`.
 *
 * The unit suite in `diffXML.test.ts` pins individual behaviours with tiny
 * synthetic fixtures. This file is the opposite — it exercises the full
 * option matrix against the real score fixtures and pins down regression
 * scenarios that have actually shipped bugs in the past.
 *
 * Run with: `pnpm vitest run src/tests/diffXML.integration.test.ts`
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { diffXML, type XMLDiffOptions, type XMLDiffResult } from "@/utils/diffXML";

// ─── Fixture loading ──────────────────────────────────────────────────────

const loadFixture = (path: string): Promise<string> =>
  Promise.resolve(readFileSync(new URL(path, import.meta.url).pathname, "utf-8"));

/**
 * Lazy-loaded score corpus. `Bun.file().text()` is cheap to repeat but the
 * tests run faster if we read each fixture exactly once.
 */
type ScoreId =
  | "chopinOp10No1"
  | "chopinOp10No2"
  | "chopinOp10No1V2"
  | "rachOp23No5"
  | "rachOp23No5V2";

const PATHS: Record<ScoreId, string> = {
  chopinOp10No1: "../scores/Chopin/etudeOp10No1.xml",
  chopinOp10No2: "../scores/Chopin/etudeOp10No2.xml",
  chopinOp10No1V2: "../scores/Chopin/etudeOp10No1V2.xml",
  rachOp23No5: "../scores/Rachmaninoff/op23no5.xml",
  rachOp23No5V2: "../scores/Rachmaninoff/op23no5V2.xml",
};

const scores: Partial<Record<ScoreId, string>> = {};

async function score(id: ScoreId): Promise<string> {
  const cached = scores[id];
  if (cached !== undefined) return cached;
  const text = await loadFixture(PATHS[id]);
  scores[id] = text;
  return text;
}

// ─── Option matrix ─────────────────────────────────────────────────────────

/**
 * Concise cross product of the option flags we actually surface in the UI.
 * `algorithm` is unrelated to the browser LCS path — covering it here would
 * be theatre, not testing — so it's pinned at "patience" throughout.
 */
const contextOptions = [0, 2, 5] as const;
const whitespaceOptions = [true, false] as const;
const detailedOptions = [true, false] as const;

function asOptions(
  contextLines: number,
  ignoreWhitespace: boolean,
  detailedDiff: boolean,
): XMLDiffOptions {
  return {
    contextLines,
    ignoreWhitespace,
    algorithm: "patience",
    detailedDiff,
  };
}

/** Sum of all populated map sizes — a quick "any diff at all" check. */
function totalChanges(result: XMLDiffResult): number {
  return result.measures.size + result.credits.size + result.partLists.size + result.children.size;
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("diffXML integration", () => {
  describe("option matrix on real Chopin fixtures", () => {
    for (const ctx of contextOptions) {
      for (const ws of whitespaceOptions) {
        for (const detailed of detailedOptions) {
          const label = `ctx=${ctx} ws=${ws} detailed=${detailed}`;

          it(`Op10No1 vs Op10No2 produces non-zero diff (${label})`, async () => {
            const xml1 = await score("chopinOp10No1");
            const xml2 = await score("chopinOp10No2");
            const result = diffXML(xml1, xml2, asOptions(ctx, ws, detailed));
            expect(totalChanges(result)).toBeGreaterThan(0);
          });

          it(`Op10No1 vs itself produces empty diff (${label})`, async () => {
            const xml1 = await score("chopinOp10No1");
            const result = diffXML(xml1, xml1, asOptions(ctx, ws, detailed));
            // No identity-comparison fast path exists — we verify the result
            // is empty, not that the function short-circuits.
            expect(totalChanges(result)).toBe(0);
          });
        }
      }
    }
  });

  describe("detailedDiff partitions output correctly", () => {
    it("detailed=true keeps measures empty and routes diffs into children", async () => {
      const xml1 = await score("chopinOp10No1");
      const xml2 = await score("chopinOp10No2");
      const result = diffXML(xml1, xml2, asOptions(2, true, true));

      expect(result.measures.size).toBe(0);
      expect(result.children.size).toBeGreaterThan(0);
    });

    it("detailed=false routes diffs into measures and leaves children empty", async () => {
      const xml1 = await score("chopinOp10No1");
      const xml2 = await score("chopinOp10No2");
      const result = diffXML(xml1, xml2, asOptions(2, true, false));

      expect(result.measures.size).toBeGreaterThan(0);
      expect(result.children.size).toBe(0);
    });
  });

  describe("regression — bun DOMParser whitespace normalisation (commit eebd40e)", () => {
    /**
     * Linkedom (and many DOMParser implementations under Bun/Node) silently
     * normalise insignificant whitespace text nodes during parsing. Before
     * eebd40e, `ignoreWhitespace: true` over scores with the SAME line shape
     * but different per-line indentation still produced spurious diffs because
     * `XMLSerializer` round-tripping went through linkedom which collapsed the
     * inter-element whitespace. The fix was a raw-substring fallback when
     * needed. This test pins that contract.
     *
     * Note: `ignoreWhitespace: true` here is a LINE-LEVEL trim — it does NOT
     * make differently-formatted XML (e.g. one-liner vs. exploded) compare as
     * equal. It only ignores leading/trailing whitespace on each line.
     */
    it("per-line indentation differences produce zero diffs when ignoreWhitespace: true", () => {
      const twoSpace = `<?xml version="1.0"?>
<score-partwise>
  <part-list>
    <score-part id="P1">
      <part-name>P</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <note><pitch><step>C</step></pitch></note>
    </measure>
  </part>
</score-partwise>`;
      const fourSpace = `<?xml version="1.0"?>
<score-partwise>
    <part-list>
        <score-part id="P1">
            <part-name>P</part-name>
        </score-part>
    </part-list>
    <part id="P1">
        <measure number="1">
            <note><pitch><step>C</step></pitch></note>
        </measure>
    </part>
</score-partwise>`;

      const result = diffXML(twoSpace, fourSpace, asOptions(2, true, false));
      expect(totalChanges(result)).toBe(0);
    });

    it("per-line indentation differences produce a diff when ignoreWhitespace: false", () => {
      const twoSpace = `<?xml version="1.0"?>
<score-partwise>
  <part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list>
  <part id="P1"><measure number="1">
    <note><pitch><step>C</step></pitch></note>
  </measure></part>
</score-partwise>`;
      const fourSpace = `<?xml version="1.0"?>
<score-partwise>
    <part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list>
    <part id="P1"><measure number="1">
        <note><pitch><step>C</step></pitch></note>
    </measure></part>
</score-partwise>`;

      const result = diffXML(twoSpace, fourSpace, asOptions(2, false, false));
      expect(totalChanges(result)).toBeGreaterThan(0);
    });
  });

  describe("regression — ElementDiff identity stability across runDiff calls (commit 3fdb065)", () => {
    /**
     * `applyDiffHighlights` uses a WeakMap keyed on ElementDiff objects to
     * memoise tooltip HTML. If `diffXML` ever returned the same plain-object
     * reference across separate calls (e.g. via shared state), the cache
     * would silently leak. Each call must produce fresh objects.
     */
    it("two consecutive diffs on the same inputs return distinct ElementDiff objects", async () => {
      const xml1 = await score("chopinOp10No1");
      const xml2 = await score("chopinOp10No2");
      const opts = asOptions(2, true, false);

      const r1 = diffXML(xml1, xml2, opts);
      const r2 = diffXML(xml1, xml2, opts);

      // At least one measure should differ; pick any key from both results.
      const sharedKeys = [...r1.measures.keys()].filter((k) => r2.measures.has(k));
      expect(sharedKeys.length).toBeGreaterThan(0);

      for (const key of sharedKeys) {
        const a = r1.measures.get(key);
        const b = r2.measures.get(key);
        // Same content...
        expect(a?.label).toBe(b?.label ?? "");
        expect(a?.changeType).toBe(b?.changeType ?? a?.changeType ?? "change");
        // ...but distinct references — proves no shared-state leak.
        expect(a).not.toBe(b);
      }
    });
  });

  describe("cross-composer pathology", () => {
    it("Chopin vs Rachmaninoff doesn't throw and produces lots of changes", async () => {
      const xml1 = await score("chopinOp10No1");
      const xml2 = await score("rachOp23No5");
      const result = diffXML(xml1, xml2, asOptions(2, true, false));
      // Wildly different scores should produce many measure-level diffs.
      expect(result.measures.size).toBeGreaterThan(5);
    });
  });

  describe("partLists are diffed (when present)", () => {
    it("partLists map is populated when part-list contents differ across fixtures", async () => {
      const xml1 = await score("chopinOp10No1");
      const xml2 = await score("chopinOp10No2");
      const result = diffXML(xml1, xml2, asOptions(2, true, false));
      // etudeOp10No1 names the instrument "Piano"; etudeOp10No2 uses
      // "Violin" — diffXML must surface that as a partLists entry.
      expect(result.partLists.size).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Rachmaninoff V1 vs V2 — measure-level diff smoke", () => {
    it("at least one measure changed between the two recordings", async () => {
      const xml1 = await score("rachOp23No5");
      const xml2 = await score("rachOp23No5V2");
      const result = diffXML(xml1, xml2, asOptions(2, true, false));
      expect(result.measures.size).toBeGreaterThan(0);
    });
  });

  describe("Chopin V1 vs V2 — same piece, near-identical edition", () => {
    it("Op10No1 vs Op10No1V2 has fewer credit-level diffs than Op10No1 vs Op10No2", async () => {
      const xml1 = await score("chopinOp10No1");
      const xml2 = await score("chopinOp10No1V2");
      const xml3 = await score("chopinOp10No2");

      const sameEdition = diffXML(xml1, xml2, asOptions(2, true, false));
      const differentPiece = diffXML(xml1, xml3, asOptions(2, true, false));

      // Two versions of the same piece (V1 vs V1V2) should produce strictly
      // fewer credit diffs than two different pieces (No1 vs No2) — the
      // title, opus number, etc. change in the latter but not the former.
      expect(sameEdition.credits.size).toBeLessThan(differentPiece.credits.size);
    });
  });
});
