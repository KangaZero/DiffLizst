/**
 * Unit tests for the annotation data layer (src/utils/annotations.ts).
 *
 * Run with: pnpm vitest run src/tests/annotations.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type Annotation,
  deleteAnnotation,
  diffKeyFor,
  loadAnnotations,
  saveAnnotation,
} from "@/utils/annotations";

// ─── localStorage stub ────────────────────────────────────────────────────────

let store: Record<string, string> = {};

beforeEach(() => {
  store = {};
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
  });
  vi.stubGlobal("crypto", {
    randomUUID: (() => {
      let n = 0;
      return () => `test-uuid-${++n}`;
    })(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAnnotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: crypto.randomUUID(),
    diffKey: "left|right",
    measure: 1,
    text: "test note",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// ─── diffKeyFor ───────────────────────────────────────────────────────────────

describe("diffKeyFor", () => {
  it("produces a stable key from two ids", () => {
    expect(diffKeyFor("Chopin-A", "Chopin-B")).toBe("Chopin-A|Chopin-B");
  });

  it("is not commutative — order matters", () => {
    expect(diffKeyFor("A", "B")).not.toBe(diffKeyFor("B", "A"));
  });

  it("returns the same string on repeated calls with the same inputs", () => {
    const first = diffKeyFor("x", "y");
    const second = diffKeyFor("x", "y");
    expect(first).toBe(second);
  });
});

// ─── loadAnnotations ──────────────────────────────────────────────────────────

describe("loadAnnotations", () => {
  it("returns an empty array when localStorage is empty", () => {
    expect(loadAnnotations("any|key")).toEqual([]);
  });

  it("returns only annotations matching the given diffKey", () => {
    const a1 = makeAnnotation({ id: "id-1", diffKey: "left|right", measure: 1 });
    const a2 = makeAnnotation({ id: "id-2", diffKey: "other|key", measure: 2 });
    saveAnnotation(a1);
    saveAnnotation(a2);

    const result = loadAnnotations("left|right");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("id-1");
  });

  it("returns all annotations when multiple share the same diffKey", () => {
    saveAnnotation(makeAnnotation({ id: "m1", diffKey: "k|k", measure: 1 }));
    saveAnnotation(makeAnnotation({ id: "m2", diffKey: "k|k", measure: 2 }));
    saveAnnotation(makeAnnotation({ id: "m3", diffKey: "k|k", measure: 3 }));

    expect(loadAnnotations("k|k")).toHaveLength(3);
  });
});

// ─── saveAnnotation ───────────────────────────────────────────────────────────

describe("saveAnnotation", () => {
  it("persists a new annotation that is then retrievable", () => {
    const ann = makeAnnotation({ id: "save-1", diffKey: "a|b", measure: 5 });
    saveAnnotation(ann);

    const loaded = loadAnnotations("a|b");
    expect(loaded).toHaveLength(1);
    expect(loaded[0].measure).toBe(5);
  });

  it("updates an existing annotation by id without duplicating it", () => {
    const ann = makeAnnotation({ id: "upd-1", text: "original", diffKey: "a|b" });
    saveAnnotation(ann);

    const updated: Annotation = { ...ann, text: "revised", updatedAt: Date.now() + 100 };
    saveAnnotation(updated);

    const all = loadAnnotations("a|b");
    expect(all).toHaveLength(1);
    expect(all[0].text).toBe("revised");
  });
});

// ─── deleteAnnotation ─────────────────────────────────────────────────────────

describe("deleteAnnotation", () => {
  it("removes the annotation with the matching id", () => {
    const a1 = makeAnnotation({ id: "del-1", diffKey: "a|b" });
    const a2 = makeAnnotation({ id: "del-2", diffKey: "a|b" });
    saveAnnotation(a1);
    saveAnnotation(a2);

    deleteAnnotation("del-1");

    const remaining = loadAnnotations("a|b");
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe("del-2");
  });

  it("is a no-op when the id does not exist", () => {
    const ann = makeAnnotation({ id: "keep-me", diffKey: "a|b" });
    saveAnnotation(ann);

    deleteAnnotation("does-not-exist");

    expect(loadAnnotations("a|b")).toHaveLength(1);
  });
});

// ─── Corrupt JSON tolerance ───────────────────────────────────────────────────

describe("corrupt JSON tolerance", () => {
  it("returns [] and allows new saves when stored value is malformed JSON", () => {
    store["difflizst.annotations"] = "{this is not json";

    const loaded = loadAnnotations("any|key");
    expect(loaded).toEqual([]);

    const ann = makeAnnotation({ id: "post-corrupt", diffKey: "any|key" });
    saveAnnotation(ann);

    expect(loadAnnotations("any|key")).toHaveLength(1);
  });

  it("returns [] when stored value is a non-array JSON value", () => {
    store["difflizst.annotations"] = '"just a string"';
    expect(loadAnnotations("any|key")).toEqual([]);
  });
});

// ─── 1 MB cap: oldest entries pruned ─────────────────────────────────────────

describe("size cap pruning", () => {
  it("prunes the oldest annotations when storage would exceed 1 MB", () => {
    // Each annotation text is ~2 KB; 600 of them exceed the 1 MB cap.
    const bigText = "x".repeat(2_000);
    for (let i = 1; i <= 600; i++) {
      saveAnnotation(
        makeAnnotation({
          id: `big-${i}`,
          diffKey: "a|b",
          measure: i,
          text: bigText,
          createdAt: i,
          updatedAt: i,
        }),
      );
    }

    const stored = store["difflizst.annotations"] ?? "";
    expect(stored.length).toBeLessThanOrEqual(1_048_576);

    // All remaining annotations must have higher createdAt values (newer).
    const remaining = loadAnnotations("a|b");
    expect(remaining.length).toBeGreaterThan(0);
    const minCreated = Math.min(...remaining.map((a) => a.createdAt));
    expect(minCreated).toBeGreaterThan(1);
  });
});

// ─── Plain-text safety ────────────────────────────────────────────────────────

describe("plain-text only", () => {
  it("text is stored and retrieved verbatim, including angle brackets, without HTML interpretation", () => {
    const dangerous = "<script>alert('xss')</script>";
    const ann = makeAnnotation({ id: "xss-check", diffKey: "a|b", text: dangerous });
    saveAnnotation(ann);

    const loaded = loadAnnotations("a|b");
    // Data layer stores the raw string — rendering layer is responsible for escaping.
    // Verify round-trip fidelity so the UI can use textContent (not innerHTML).
    expect(loaded[0].text).toBe(dangerous);
  });
});
