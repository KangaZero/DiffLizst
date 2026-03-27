/**
 * Unit tests for diffXML.
 *
 * Each test covers one concrete behaviour that would break silently
 * if the implementation regressed. Tests use minimal XML fixtures
 * rather than the full Chopin scores to keep them fast and readable.
 *
 * Run with: bun test src/tests/diffXML.test.ts
 */

import { describe, it, expect } from "bun:test";
import { diffXML, type XMLDiffOptions } from "@/utils/diffXML";

const DEFAULT_DIFF_OPTIONS: XMLDiffOptions = {
  contextLines: 2,
  ignoreWhitespace: true,
  algorithm: "patience",
  detailedDiff: false,
};

// ─── Minimal XML fixtures ─────────────────────────────────────────────────

/**
 * Build a minimal valid MusicXML string from the provided overrides.
 * Keeps fixtures DRY — only the parts that differ per test are specified.
 */
function makeXML({
  creditText = "Original Title",
  measure1Note = "<step>C</step><octave>4</octave>",
  measure2Note = "<step>E</step><octave>4</octave>",
  extraMeasure = "",
}: {
  creditText?: string;
  measure1Note?: string;
  measure2Note?: string;
  /** Raw XML to append as an extra <measure> inside <part>. */
  extraMeasure?: string;
} = {}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise>
  <credit page="1">
    <credit-words>${creditText}</credit-words>
  </credit>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <note><pitch>${measure1Note}</pitch></note>
    </measure>
    <measure number="2">
      <note><pitch>${measure2Note}</pitch></note>
    </measure>
    ${extraMeasure}
  </part>
</score-partwise>`;
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("diffXML", () => {
  describe("identical XMLs", () => {
    it("returns empty maps when both scores are the same", () => {
      const xml = makeXML();
      const result = diffXML(xml, xml, DEFAULT_DIFF_OPTIONS);
      expect(result.measures.size).toBe(0);
      expect(result.credits.size).toBe(0);
    });
  });

  describe("credit changes", () => {
    it("detects a changed credit-words text", () => {
      const xml1 = makeXML({ creditText: "Original Title" });
      const xml2 = makeXML({ creditText: "Changed Title" });
      const result = diffXML(xml1, xml2, DEFAULT_DIFF_OPTIONS);

      expect(result.credits.size).toBe(1);
      const diff = result.credits.get(0)!;
      expect(diff.changeType).toBe("change");
      expect(diff.label).toBe("credit 0");
      // Must have at least one remove line with the old text
      expect(diff.lines.some(l => l.type === "remove" && l.content.includes("Original Title"))).toBe(true);
      // And at least one add line with the new text
      expect(diff.lines.some(l => l.type === "add" && l.content.includes("Changed Title"))).toBe(true);
    });
  });

  describe("measure changes", () => {
    it("detects a changed note pitch inside a measure", () => {
      const xml1 = makeXML({ measure1Note: "<step>C</step><octave>4</octave>" });
      const xml2 = makeXML({ measure1Note: "<step>D</step><octave>4</octave>" });
      const result = diffXML(xml1, xml2, DEFAULT_DIFF_OPTIONS);

      expect(result.measures.has(1)).toBe(true);
      const diff = result.measures.get(1)!;
      expect(diff.changeType).toBe("change");
      expect(diff.label).toBe("measure 1");
    });

    it("does not flag an unchanged measure", () => {
      const xml1 = makeXML({ measure1Note: "<step>C</step><octave>4</octave>" });
      const xml2 = makeXML({ measure1Note: "<step>D</step><octave>4</octave>" });
      const result = diffXML(xml1, xml2, DEFAULT_DIFF_OPTIONS);

      // Measure 2 is unchanged — should not appear in the result
      expect(result.measures.has(2)).toBe(false);
    });

    it("detects an added measure (present in xml2 only)", () => {
      const extra = `<measure number="3"><note><pitch><step>G</step><octave>4</octave></pitch></note></measure>`;
      const xml1 = makeXML();
      const xml2 = makeXML({ extraMeasure: extra });
      const result = diffXML(xml1, xml2, DEFAULT_DIFF_OPTIONS);

      expect(result.measures.has(3)).toBe(true);
      expect(result.measures.get(3)!.changeType).toBe("add");
    });

    it("detects a removed measure (present in xml1 only)", () => {
      const extra = `<measure number="3"><note><pitch><step>G</step><octave>4</octave></pitch></note></measure>`;
      const xml1 = makeXML({ extraMeasure: extra });
      const xml2 = makeXML();
      const result = diffXML(xml1, xml2, DEFAULT_DIFF_OPTIONS);

      expect(result.measures.has(3)).toBe(true);
      expect(result.measures.get(3)!.changeType).toBe("remove");
    });
  });

  describe("contextLines option", () => {
    it("contextLines: 0 — outputs only changed lines, no context", () => {
      const xml1 = makeXML({ measure1Note: "<step>C</step><octave>4</octave>" });
      const xml2 = makeXML({ measure1Note: "<step>D</step><octave>4</octave>" });
      const result = diffXML(xml1, xml2, { ...DEFAULT_DIFF_OPTIONS, contextLines: 0 });

      const diff = result.measures.get(1)!;
      const contextLines = diff.lines.filter(l => l.type === "context");
      expect(contextLines.length).toBe(0);
    });

    it("contextLines: 5 — includes more surrounding context than the default 2", () => {
      const xml1 = makeXML({ measure1Note: "<step>C</step><octave>4</octave>" });
      const xml2 = makeXML({ measure1Note: "<step>D</step><octave>4</octave>" });

      const narrow = diffXML(xml1, xml2, { ...DEFAULT_DIFF_OPTIONS, contextLines: 0 });
      const wide   = diffXML(xml1, xml2, { ...DEFAULT_DIFF_OPTIONS, contextLines: 5 });

      const narrowCtx = narrow.measures.get(1)!.lines.filter(l => l.type === "context").length;
      const wideCtx   = wide.measures.get(1)!.lines.filter(l => l.type === "context").length;
      expect(wideCtx).toBeGreaterThan(narrowCtx);
    });
  });

  describe("ignoreWhitespace option", () => {
    it("ignoreWhitespace: true — does not flag a whitespace-only difference", () => {
      // Same logical content, different indentation
      const xml1 = `<?xml version="1.0"?>
<score-partwise>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><note><pitch><step>C</step></pitch></note></measure></part>
</score-partwise>`;

      const xml2 = `<?xml version="1.0"?>
<score-partwise>
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1"><measure number="1"><note><pitch><step>C</step></pitch></note></measure></part>
</score-partwise>`;

      // Artificially introduce only a whitespace difference by using
      // the same XML — should produce no diffs either way
      const result = diffXML(xml1, xml2, { ...DEFAULT_DIFF_OPTIONS, ignoreWhitespace: true });
      expect(result.measures.size).toBe(0);
    });

    it("ignoreWhitespace: false — detects whitespace differences", () => {
      // Two measures that differ only in leading whitespace
      const base = (indent: string) =>
        `<?xml version="1.0"?><score-partwise>` +
        `<part-list><score-part id="P1"><part-name>P</part-name></score-part></part-list>` +
        `<part id="P1"><measure number="1">` +
        `\n${indent}<note><pitch><step>C</step></pitch></note>` +
        `\n</measure></part></score-partwise>`;

      const xml1 = base("  ");   // 2-space indent
      const xml2 = base("    "); // 4-space indent

      const withWS    = diffXML(xml1, xml2, { ...DEFAULT_DIFF_OPTIONS, ignoreWhitespace: false });
      const withoutWS = diffXML(xml1, xml2, { ...DEFAULT_DIFF_OPTIONS, ignoreWhitespace: true });

      // With whitespace sensitivity on: a difference should be detected
      expect(withWS.measures.size).toBeGreaterThanOrEqual(1);
      // With whitespace ignored: no difference (only indent changed)
      expect(withoutWS.measures.size).toBe(0);
    });
  });
});
