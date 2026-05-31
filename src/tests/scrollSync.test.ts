/**
 * Unit tests for wireScrollSync.
 *
 * The node test environment has no requestAnimationFrame. We install a
 * synchronous shim so callbacks fire immediately — this keeps tests
 * deterministic without async timers.
 *
 * Run with: pnpm vitest run src/tests/scrollSync.test.ts
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { wireScrollSync } from "@/bootstrap/scroll-sync";

// ─── rAF shim ─────────────────────────────────────────────────────────────
// requestAnimationFrame does not exist in the node test environment.
// A synchronous shim makes the double-rAF pattern collapse to immediate
// execution, which is correct for unit tests — we want to assert the
// end-state without waiting for real frame timing.
let rafShim: ReturnType<typeof vi.fn>;

beforeAll(() => {
  rafShim = vi.fn((cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  // @ts-expect-error — polyfilling a browser global in node
  globalThis.requestAnimationFrame = rafShim;
});

afterAll(() => {
  // @ts-expect-error — cleanup
  delete globalThis.requestAnimationFrame;
});

// ─── Stub element factory ───────────────────────────────────────────────────

interface ScrollStub {
  scrollLeft: number;
  scrollTop: number;
  scrollWidth: number;
  scrollHeight: number;
  clientWidth: number;
  clientHeight: number;
  dataset: Record<string, string | undefined>;
  listeners: Map<string, EventListenerOrEventListenerObject[]>;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    opts?: AddEventListenerOptions,
  ): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  emit(type: string): void;
}

function makeStub(
  overrides: Partial<
    Pick<ScrollStub, "scrollWidth" | "scrollHeight" | "clientWidth" | "clientHeight">
  > = {},
): ScrollStub & HTMLElement {
  const listeners = new Map<string, EventListenerOrEventListenerObject[]>();
  const stub: ScrollStub = {
    scrollLeft: 0,
    scrollTop: 0,
    scrollWidth: overrides.scrollWidth ?? 1000,
    scrollHeight: overrides.scrollHeight ?? 500,
    clientWidth: overrides.clientWidth ?? 200,
    clientHeight: overrides.clientHeight ?? 100,
    dataset: {},
    listeners,
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type)!.push(listener);
    },
    removeEventListener(type, listener) {
      const existing = listeners.get(type);
      if (!existing) return;
      const idx = existing.indexOf(listener);
      if (idx !== -1) existing.splice(idx, 1);
    },
    emit(type) {
      const handlers = listeners.get(type) ?? [];
      for (const h of handlers) {
        if (typeof h === "function") h(new Event(type));
        else h.handleEvent(new Event(type));
      }
    },
  };
  // Cast: tests only exercise the scroll-related surface; no full HTMLElement needed.
  return stub as unknown as ScrollStub & HTMLElement;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("wireScrollSync", () => {
  let a: ScrollStub & HTMLElement;
  let b: ScrollStub & HTMLElement;

  beforeEach(() => {
    rafShim.mockClear();
    // scrollWidth 1000, clientWidth 200 → 800px scrollable range
    a = makeStub({ scrollWidth: 1000, clientWidth: 200, scrollHeight: 500, clientHeight: 100 });
    // scrollWidth 600, clientWidth 200 → 400px scrollable range (different from A)
    b = makeStub({ scrollWidth: 600, clientWidth: 200, scrollHeight: 300, clientHeight: 100 });
  });

  it("scrolling A syncs B proportionally on the x axis", () => {
    wireScrollSync(a, b);

    // Scroll A to 50% of its scrollable width (400px out of 800px range).
    a.scrollLeft = 400;
    a.emit("scroll");

    // B should be at 50% of its own scrollable range: 0.5 * (600 - 200) = 200.
    expect(b.scrollLeft).toBe(200);
  });

  it("scrolling B syncs A proportionally on the x axis", () => {
    wireScrollSync(a, b);

    // Scroll B to 25% of its scrollable range (100px out of 400px).
    b.scrollLeft = 100;
    b.emit("scroll");

    // A should be at 25% of its scrollable range: 0.25 * 800 = 200.
    expect(a.scrollLeft).toBe(200);
  });

  it("does not recursively call A's setter when B responds to A's scroll", () => {
    // Track how many times scrollLeft is assigned on A.
    let aWriteCount = 0;
    let aScrollLeftValue = 0;
    Object.defineProperty(a, "scrollLeft", {
      get: () => aScrollLeftValue,
      set: (v: number) => {
        aWriteCount++;
        aScrollLeftValue = v;
      },
      configurable: true,
    });

    wireScrollSync(a, b);

    // Trigger A's scroll handler once.
    aScrollLeftValue = 400;
    a.emit("scroll");

    // A's scrollLeft should only have been written during the initial setup —
    // not written again as a reflex from B being scrolled.
    expect(aWriteCount).toBe(0);
  });

  it("blocks sync when source has data-scroll-sync='off'", () => {
    wireScrollSync(a, b);
    a.dataset.scrollSync = "off";

    a.scrollLeft = 400;
    a.emit("scroll");

    expect(b.scrollLeft).toBe(0);
  });

  it("blocks sync when target has data-scroll-sync='off'", () => {
    wireScrollSync(a, b);
    b.dataset.scrollSync = "off";

    a.scrollLeft = 400;
    a.emit("scroll");

    expect(b.scrollLeft).toBe(0);
  });

  it("removes both listeners when the disposer is called", () => {
    const dispose = wireScrollSync(a, b);
    dispose();

    // After dispose, scrolling A must not touch B.
    a.scrollLeft = 400;
    a.emit("scroll");
    expect(b.scrollLeft).toBe(0);

    // After dispose, scrolling B must not touch A.
    // A is currently at 400 (set above); B scroll must leave A unchanged.
    const aBeforeB = a.scrollLeft;
    b.scrollLeft = 100;
    b.emit("scroll");
    expect(a.scrollLeft).toBe(aBeforeB);
  });

  it("produces 0 (not NaN) when source has no scrollable content on x axis", () => {
    // clientWidth === scrollWidth → zero scrollable range
    const flatA = makeStub({ scrollWidth: 200, clientWidth: 200 });
    const normalB = makeStub({ scrollWidth: 600, clientWidth: 200 });

    wireScrollSync(flatA, normalB);

    flatA.scrollLeft = 0;
    flatA.emit("scroll");

    // 0/0 would be NaN; we expect 0.
    expect(normalB.scrollLeft).toBe(0);
    expect(Number.isNaN(normalB.scrollLeft)).toBe(false);
  });

  it("produces 0 (not NaN) when source has no scrollable content on y axis", () => {
    const flatA = makeStub({ scrollHeight: 100, clientHeight: 100 });
    const normalB = makeStub({ scrollHeight: 300, clientHeight: 100 });

    wireScrollSync(flatA, normalB);

    flatA.scrollTop = 0;
    flatA.emit("scroll");

    expect(normalB.scrollTop).toBe(0);
    expect(Number.isNaN(normalB.scrollTop)).toBe(false);
  });
});
