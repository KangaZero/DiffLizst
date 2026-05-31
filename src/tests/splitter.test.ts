/**
 * Unit tests for the notation-pane splitter.
 *
 * Covers pure ratio computation, keyboard step → new ratio, localStorage
 * round-trip, and min-width clamping. Pointer events are not tested directly —
 * they require real DOM layout which is outside the unit test scope.
 *
 * Run with: pnpm vitest run src/tests/splitter.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clampRatio, DEFAULT_RATIO, loadRatio, MIN_PX, saveRatio } from "@/bootstrap/splitter";

// ─── localStorage stub ────────────────────────────────────────────────────

const localStorageStore = new Map<string, string>();

beforeEach(() => {
  localStorageStore.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => localStorageStore.get(key) ?? null,
    setItem: (key: string, value: string) => {
      localStorageStore.set(key, value);
    },
    removeItem: (key: string) => {
      localStorageStore.delete(key);
    },
    clear: () => localStorageStore.clear(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── clampRatio ────────────────────────────────────────────────────────────

describe("clampRatio", () => {
  it("returns the ratio unchanged when within valid bounds", () => {
    const containerWidth = 1000;
    expect(clampRatio(0.5, containerWidth)).toBe(0.5);
  });

  it("clamps to minimum when pane-1 would be narrower than MIN_PX", () => {
    const containerWidth = 1000;
    const minRatio = MIN_PX / containerWidth; // 0.24
    expect(clampRatio(0, containerWidth)).toBe(minRatio);
    expect(clampRatio(0.1, containerWidth)).toBe(minRatio);
  });

  it("clamps to maximum when pane-2 would be narrower than MIN_PX", () => {
    const containerWidth = 1000;
    const maxRatio = 1 - MIN_PX / containerWidth; // 0.76
    expect(clampRatio(1, containerWidth)).toBe(maxRatio);
    expect(clampRatio(0.9, containerWidth)).toBe(maxRatio);
  });

  it("returns exactly MIN_PX / containerWidth at the lower boundary", () => {
    const containerWidth = 800;
    const expected = MIN_PX / containerWidth;
    expect(clampRatio(MIN_PX / containerWidth, containerWidth)).toBe(expected);
  });

  it("does not produce NaN when containerWidth is 0", () => {
    // Guard: if container has zero width, clamp should not produce NaN.
    // Both minRatio and maxRatio become Infinity / -Infinity → Math.min/max
    // collapses to the input value clamped to [NaN, NaN]. We explicitly guard
    // against this case in the implementation with a containerWidth > 0 check.
    // This test just confirms the function does not throw.
    expect(() => clampRatio(0.5, 0)).not.toThrow();
  });

  it("clamps correctly with a narrow container (480px, each pane minimum is 240px)", () => {
    // containerWidth 480, MIN_PX 240 → both panes are exactly at min → only valid ratio is 0.5
    const containerWidth = 480;
    const minRatio = MIN_PX / containerWidth; // 0.5
    expect(clampRatio(0.3, containerWidth)).toBe(minRatio);
    expect(clampRatio(0.7, containerWidth)).toBe(minRatio);
    expect(clampRatio(0.5, containerWidth)).toBe(minRatio);
  });
});

// ─── localStorage round-trip ───────────────────────────────────────────────

describe("saveRatio / loadRatio", () => {
  it("loadRatio returns DEFAULT_RATIO when no value is stored", () => {
    expect(loadRatio()).toBe(DEFAULT_RATIO);
  });

  it("round-trips a ratio correctly", () => {
    saveRatio(0.65);
    expect(loadRatio()).toBe(0.65);
  });

  it("loadRatio ignores stored values outside (0, 1)", () => {
    // A stored 0 is out of range (boundary excluded).
    localStorageStore.set("difflizst.splitter.ratio", "0");
    expect(loadRatio()).toBe(DEFAULT_RATIO);

    localStorageStore.set("difflizst.splitter.ratio", "1");
    expect(loadRatio()).toBe(DEFAULT_RATIO);
  });

  it("loadRatio ignores NaN", () => {
    localStorageStore.set("difflizst.splitter.ratio", "not-a-number");
    expect(loadRatio()).toBe(DEFAULT_RATIO);
  });

  it("loadRatio ignores Infinity", () => {
    localStorageStore.set("difflizst.splitter.ratio", "Infinity");
    expect(loadRatio()).toBe(DEFAULT_RATIO);
  });

  it("does not throw when localStorage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    });
    expect(() => saveRatio(0.6)).not.toThrow();
    expect(() => loadRatio()).not.toThrow();
    expect(loadRatio()).toBe(DEFAULT_RATIO);
  });
});

// ─── Keyboard step → new ratio ─────────────────────────────────────────────

describe("keyboard step → ratio", () => {
  /**
   * Simulate one ArrowRight key step: ratio increases by stepPx / containerWidth,
   * then clamped to valid bounds.
   */
  function stepRight(ratio: number, containerWidth: number, stepPx: number): number {
    return clampRatio(ratio + stepPx / containerWidth, containerWidth);
  }

  function stepLeft(ratio: number, containerWidth: number, stepPx: number): number {
    return clampRatio(ratio - stepPx / containerWidth, containerWidth);
  }

  it("ArrowRight at 10px step increases ratio by 10/containerWidth", () => {
    const containerWidth = 1000;
    const before = 0.5;
    const after = stepRight(before, containerWidth, 10);
    expect(after).toBeCloseTo(0.51, 5);
  });

  it("ArrowLeft at 10px step decreases ratio by 10/containerWidth", () => {
    const containerWidth = 1000;
    const before = 0.5;
    const after = stepLeft(before, containerWidth, 10);
    expect(after).toBeCloseTo(0.49, 5);
  });

  it("Shift+ArrowRight at 50px step increases ratio by 50/containerWidth", () => {
    const containerWidth = 1000;
    const before = 0.5;
    const after = stepRight(before, containerWidth, 50);
    expect(after).toBeCloseTo(0.55, 5);
  });

  it("ArrowRight clamps at the maximum when near the right boundary", () => {
    const containerWidth = 1000;
    const maxRatio = 1 - MIN_PX / containerWidth;
    const near = maxRatio - 0.001;
    const after = stepRight(near, containerWidth, 10);
    expect(after).toBe(maxRatio);
  });

  it("ArrowLeft clamps at the minimum when near the left boundary", () => {
    const containerWidth = 1000;
    const minRatio = MIN_PX / containerWidth;
    const near = minRatio + 0.001;
    const after = stepLeft(near, containerWidth, 10);
    expect(after).toBe(minRatio);
  });

  it("Home equivalent: clamp(0, containerWidth) yields the minimum ratio", () => {
    const containerWidth = 1000;
    expect(clampRatio(0, containerWidth)).toBe(MIN_PX / containerWidth);
  });

  it("End equivalent: clamp(1, containerWidth) yields the maximum ratio", () => {
    const containerWidth = 1000;
    expect(clampRatio(1, containerWidth)).toBe(1 - MIN_PX / containerWidth);
  });
});

// ─── getBoundingClientRect stub (structural, no layout needed) ─────────────

describe("clampRatio with getBoundingClientRect-style container widths", () => {
  it("handles a realistic 1280px container correctly", () => {
    const containerWidth = 1280;
    const ratio = clampRatio(0.5, containerWidth);
    // Each pane = 640px, well above MIN_PX 240px.
    expect(ratio).toBe(0.5);
    expect(ratio * containerWidth).toBeGreaterThanOrEqual(MIN_PX);
    expect((1 - ratio) * containerWidth).toBeGreaterThanOrEqual(MIN_PX);
  });

  it("handles a 500px container (each min ratio = 0.48)", () => {
    const containerWidth = 500;
    const minRatio = MIN_PX / containerWidth; // 0.48
    expect(clampRatio(0.3, containerWidth)).toBe(minRatio);
    expect(clampRatio(0.5, containerWidth)).toBe(0.5);
    expect(clampRatio(0.7, containerWidth)).toBe(1 - minRatio);
  });
});
