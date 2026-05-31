/**
 * Unit tests for urlState encode/decode helpers.
 *
 * Run with: pnpm vitest run src/tests/urlState.test.ts
 */

import { describe, expect, it } from "vitest";
import { decodeState, encodeState, type ShareableState } from "@/utils/urlState";

// ─── encodeState ──────────────────────────────────────────────────────────────

describe("encodeState", () => {
  it("produces a fragment starting with #", () => {
    const fragment = encodeState({ leftId: "A", rightId: "B" });
    expect(fragment.startsWith("#")).toBe(true);
  });

  it("includes left and right keys", () => {
    const fragment = encodeState({
      leftId: "Chopin-etudeOp10No1",
      rightId: "Chopin-etudeOp10No1V2",
    });
    expect(fragment).toContain("left=Chopin-etudeOp10No1");
    expect(fragment).toContain("right=Chopin-etudeOp10No1V2");
  });

  it("omits boolean flags when false/undefined", () => {
    const fragment = encodeState({ leftId: "A", rightId: "B" });
    expect(fragment).not.toContain("detailed");
    expect(fragment).not.toContain("palette");
    expect(fragment).not.toContain("ws");
  });

  it("includes boolean flags as '1' when true", () => {
    const fragment = encodeState({
      leftId: "A",
      rightId: "B",
      detailedDiff: true,
      colorblindPalette: true,
      ignoreWhitespace: true,
    });
    expect(fragment).toContain("detailed=1");
    expect(fragment).toContain("palette=1");
    expect(fragment).toContain("ws=1");
  });

  it("omits ctx when contextLines is undefined", () => {
    const fragment = encodeState({ leftId: "A", rightId: "B" });
    expect(fragment).not.toContain("ctx");
  });

  it("includes ctx as decimal string when contextLines is provided", () => {
    const fragment = encodeState({ leftId: "A", rightId: "B", contextLines: 3 });
    expect(fragment).toContain("ctx=3");
  });

  it("stays under 200 chars for a typical diff pair", () => {
    const fragment = encodeState({
      leftId: "Chopin-etudeOp10No1V2",
      rightId: "Chopin-etudeOp10No1",
      detailedDiff: true,
      colorblindPalette: true,
      contextLines: 5,
    });
    expect(fragment.length).toBeLessThan(200);
  });
});

// ─── decodeState ──────────────────────────────────────────────────────────────

describe("decodeState", () => {
  it("returns {} for an empty string", () => {
    expect(decodeState("")).toEqual({});
  });

  it("returns {} for a whitespace-only string", () => {
    expect(decodeState("   ")).toEqual({});
  });

  it("returns {} for a bare '#'", () => {
    expect(decodeState("#")).toEqual({});
  });

  it("strips the leading '#' before parsing", () => {
    const result = decodeState("#left=A&right=B");
    expect(result.leftId).toBe("A");
    expect(result.rightId).toBe("B");
  });

  it("parses a fragment without a leading '#'", () => {
    const result = decodeState("left=A&right=B");
    expect(result.leftId).toBe("A");
    expect(result.rightId).toBe("B");
  });

  it("returns only leftId when only 'left' key is present", () => {
    const result = decodeState("#left=A");
    expect(result).toEqual({ leftId: "A" });
  });

  it("ignores unknown keys", () => {
    const result = decodeState("#left=A&right=B&unknown=xyz&foo=bar");
    expect(result).toEqual({ leftId: "A", rightId: "B" });
  });

  it("parses boolean flags when set to '1'", () => {
    const result = decodeState("#left=A&right=B&detailed=1&palette=1&ws=1");
    expect(result.detailedDiff).toBe(true);
    expect(result.colorblindPalette).toBe(true);
    expect(result.ignoreWhitespace).toBe(true);
  });

  it("does not include boolean flags when their value is not '1'", () => {
    const result = decodeState("#left=A&right=B&detailed=0&palette=false");
    expect(result.detailedDiff).toBeUndefined();
    expect(result.colorblindPalette).toBeUndefined();
  });

  it("parses contextLines as an integer", () => {
    const result = decodeState("#left=A&right=B&ctx=5");
    expect(result.contextLines).toBe(5);
  });

  it("drops contextLines when ctx is NaN, does not throw", () => {
    expect(() => {
      const result = decodeState("#left=A&right=B&ctx=notanumber");
      expect(result.contextLines).toBeUndefined();
    }).not.toThrow();
  });

  it("drops contextLines when ctx is a float string", () => {
    const result = decodeState("#left=A&right=B&ctx=2.5");
    // parseInt("2.5") === 2, so this is a valid integer — contextLines === 2
    expect(result.contextLines).toBe(2);
  });
});

// ─── Round-trip ───────────────────────────────────────────────────────────────

describe("round-trip: decodeState(encodeState(x)) === x", () => {
  it("round-trips a minimal state", () => {
    const state: ShareableState = { leftId: "ScoreA", rightId: "ScoreB" };
    const decoded = decodeState(encodeState(state));
    expect(decoded).toEqual(state);
  });

  it("round-trips a fully populated state", () => {
    const state: ShareableState = {
      leftId: "Chopin-etudeOp10No1V2",
      rightId: "Chopin-etudeOp10No1",
      detailedDiff: true,
      colorblindPalette: true,
      ignoreWhitespace: true,
      contextLines: 4,
    };
    const decoded = decodeState(encodeState(state));
    expect(decoded).toEqual(state);
  });

  it("round-trips a state with only some boolean flags set", () => {
    const state: ShareableState = {
      leftId: "X",
      rightId: "Y",
      ignoreWhitespace: true,
      contextLines: 2,
    };
    const decoded = decodeState(encodeState(state));
    expect(decoded).toEqual(state);
  });
});
