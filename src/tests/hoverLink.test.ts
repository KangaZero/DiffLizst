/**
 * Unit tests for the pure-logic helpers in hover-link.ts.
 *
 * DOM-mutation behaviour (wireOverlayToMonaco, wireMonacoToOverlay) requires
 * a live Monaco editor instance and is covered by the E2E suite.
 * Only lineRangeFor and buildLineToOverlayLookup are tested here — they are
 * pure functions with no side effects.
 *
 * Run with: `pnpm vitest run src/tests/hoverLink.test.ts`
 */

import { describe, expect, it } from "vitest";
import type { OverlayRecord } from "@/bootstrap/hover-link";
import { buildLineToOverlayLookup, lineRangeFor } from "@/bootstrap/hover-link";
import type { ElementDiff } from "@/utils/diffXML";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeRemoveDiff(lines: { oldLineNo: number }[]): ElementDiff {
  return {
    changeType: "remove",
    label: "measure 1",
    lines: lines.map((l) => ({
      type: "remove" as const,
      content: "<note/>",
      oldLineNo: l.oldLineNo,
    })),
  };
}

function makeAddDiff(lines: { newLineNo: number }[]): ElementDiff {
  return {
    changeType: "add",
    label: "measure 2",
    lines: lines.map((l) => ({
      type: "add" as const,
      content: "<note/>",
      newLineNo: l.newLineNo,
    })),
  };
}

function makeChangeDiff(
  lines: Array<
    | { type: "remove"; oldLineNo: number }
    | { type: "add"; newLineNo: number }
    | { type: "context"; oldLineNo: number; newLineNo: number }
  >,
): ElementDiff {
  return {
    changeType: "change",
    label: "measure 3",
    lines: lines.map((l) => {
      if (l.type === "remove")
        return { type: "remove" as const, content: "-line", oldLineNo: l.oldLineNo };
      if (l.type === "add")
        return { type: "add" as const, content: "+line", newLineNo: l.newLineNo };
      return {
        type: "context" as const,
        content: " line",
        oldLineNo: l.oldLineNo,
        newLineNo: l.newLineNo,
      };
    }),
  };
}

function fakeRecord(diff: ElementDiff): OverlayRecord {
  // Stub element — buildLineToOverlayLookup only stores the reference and
  // never calls DOM methods, so a typed cast is safe for unit testing.
  return { overlay: {} as HTMLDivElement, diff };
}

// ─── lineRangeFor ────────────────────────────────────────────────────────────

describe("lineRangeFor", () => {
  it("returns null for a diff with no lines", () => {
    const diff: ElementDiff = { changeType: "change", label: "x", lines: [] };
    expect(lineRangeFor(diff, "original")).toBeNull();
    expect(lineRangeFor(diff, "modified")).toBeNull();
  });

  it("computes original range from remove lines", () => {
    const diff = makeRemoveDiff([{ oldLineNo: 10 }, { oldLineNo: 12 }, { oldLineNo: 11 }]);
    const range = lineRangeFor(diff, "original");
    expect(range).toEqual({ startLineNumber: 10, endLineNumber: 12 });
  });

  it("returns null on original side when diff only has add lines", () => {
    const diff = makeAddDiff([{ newLineNo: 5 }, { newLineNo: 6 }]);
    expect(lineRangeFor(diff, "original")).toBeNull();
  });

  it("computes modified range from add lines", () => {
    const diff = makeAddDiff([{ newLineNo: 5 }, { newLineNo: 7 }]);
    const range = lineRangeFor(diff, "modified");
    expect(range).toEqual({ startLineNumber: 5, endLineNumber: 7 });
  });

  it("returns null on modified side when diff only has remove lines", () => {
    const diff = makeRemoveDiff([{ oldLineNo: 3 }]);
    expect(lineRangeFor(diff, "modified")).toBeNull();
  });

  it("uses context lines for both sides on a change diff", () => {
    const diff = makeChangeDiff([
      { type: "context", oldLineNo: 8, newLineNo: 8 },
      { type: "remove", oldLineNo: 9 },
      { type: "add", newLineNo: 9 },
      { type: "context", oldLineNo: 10, newLineNo: 10 },
    ]);
    expect(lineRangeFor(diff, "original")).toEqual({ startLineNumber: 8, endLineNumber: 10 });
    expect(lineRangeFor(diff, "modified")).toEqual({ startLineNumber: 8, endLineNumber: 10 });
  });

  it("handles a single-line diff", () => {
    const diff = makeRemoveDiff([{ oldLineNo: 42 }]);
    expect(lineRangeFor(diff, "original")).toEqual({
      startLineNumber: 42,
      endLineNumber: 42,
    });
  });
});

// ─── buildLineToOverlayLookup ─────────────────────────────────────────────────

describe("buildLineToOverlayLookup", () => {
  it("returns empty array for lines not covered by any diff", () => {
    const r = fakeRecord(makeRemoveDiff([{ oldLineNo: 5 }]));
    const lookup = buildLineToOverlayLookup([r], "original");
    expect(lookup(99)).toEqual([]);
  });

  it("resolves a line to the record covering it", () => {
    const r = fakeRecord(makeRemoveDiff([{ oldLineNo: 10 }, { oldLineNo: 12 }]));
    const lookup = buildLineToOverlayLookup([r], "original");
    expect(lookup(11)).toEqual([r]);
    expect(lookup(10)).toEqual([r]);
    expect(lookup(12)).toEqual([r]);
  });

  it("returns multiple records when their ranges overlap on the same line", () => {
    const r1 = fakeRecord(makeRemoveDiff([{ oldLineNo: 5 }, { oldLineNo: 6 }]));
    const r2 = fakeRecord(makeRemoveDiff([{ oldLineNo: 6 }, { oldLineNo: 7 }]));
    const lookup = buildLineToOverlayLookup([r1, r2], "original");
    expect(lookup(6)).toHaveLength(2);
  });

  it("ignores records on the wrong side (modified lookup skips remove-only diff)", () => {
    const removeOnly = fakeRecord(makeRemoveDiff([{ oldLineNo: 3 }]));
    const lookup = buildLineToOverlayLookup([removeOnly], "modified");
    // remove diff has no newLineNo → lineRangeFor returns null → no index entry
    expect(lookup(3)).toEqual([]);
  });

  it("returns an empty array from an empty records list", () => {
    const lookup = buildLineToOverlayLookup([], "original");
    expect(lookup(1)).toEqual([]);
  });
});
