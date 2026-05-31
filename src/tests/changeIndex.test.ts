/**
 * Unit tests for the flattenChanges + countByChangeType helpers used by the
 * next/prev nav and the diff summary sidebar.
 *
 * Run with: pnpm vitest run src/tests/changeIndex.test.ts
 */

import { describe, expect, it } from "vitest";
import { countByChangeType, flattenChanges } from "@/utils/changeIndex";
import type { ChildDiffKey, ElementDiff, XMLDiffResult } from "@/utils/diffXML";

/** Tiny ElementDiff factory — only the fields the tests assert against. */
function makeDiff(label: string, changeType: ElementDiff["changeType"] = "change"): ElementDiff {
  return { changeType, label, lines: [] };
}

function emptyResult(): XMLDiffResult {
  return {
    measures: new Map(),
    credits: new Map(),
    partLists: new Map(),
    children: new Map(),
  };
}

describe("flattenChanges", () => {
  it("returns an empty array for a null diff", () => {
    expect(flattenChanges(null)).toEqual([]);
  });

  it("returns an empty array when every bucket is empty", () => {
    expect(flattenChanges(emptyResult())).toEqual([]);
  });

  it("orders credits, partLists, measures, then root children", () => {
    const r = emptyResult();
    r.credits.set(0, makeDiff("credit 0"));
    r.partLists.set(0, makeDiff("part-list 0"));
    r.measures.set(1, makeDiff("measure 1"));
    r.children.set("root-work-title-0" as ChildDiffKey, makeDiff("score · work-title"));

    const sources = flattenChanges(r).map((e) => e.source);
    expect(sources).toEqual(["credit", "partList", "measure", "rootChild"]);
  });

  it("sorts measures by number even when inserted out of order", () => {
    const r = emptyResult();
    r.measures.set(5, makeDiff("measure 5"));
    r.measures.set(1, makeDiff("measure 1"));
    r.measures.set(3, makeDiff("measure 3"));
    const labels = flattenChanges(r).map((e) => e.diff.label);
    expect(labels).toEqual(["measure 1", "measure 3", "measure 5"]);
  });

  it("places measure children directly after their parent measure", () => {
    const r = emptyResult();
    r.measures.set(1, makeDiff("measure 1"));
    r.measures.set(2, makeDiff("measure 2"));
    r.children.set("1-note-0" as ChildDiffKey, makeDiff("measure 1 · note 1"));
    r.children.set("2-note-0" as ChildDiffKey, makeDiff("measure 2 · note 1"));

    const labels = flattenChanges(r).map((e) => e.diff.label);
    expect(labels).toEqual(["measure 1", "measure 1 · note 1", "measure 2", "measure 2 · note 1"]);
  });

  it("handles detailedDiff mode where measures map is empty but children exist", () => {
    const r = emptyResult();
    r.children.set("1-note-0" as ChildDiffKey, makeDiff("measure 1 · note 1"));
    r.children.set("1-note-1" as ChildDiffKey, makeDiff("measure 1 · note 2"));
    r.children.set("3-note-0" as ChildDiffKey, makeDiff("measure 3 · note 1"));

    const labels = flattenChanges(r).map((e) => e.diff.label);
    expect(labels).toEqual(["measure 1 · note 1", "measure 1 · note 2", "measure 3 · note 1"]);
  });

  it("attaches measureNumber to child entries", () => {
    const r = emptyResult();
    r.children.set("5-note-2" as ChildDiffKey, makeDiff("measure 5 · note 3"));
    const [entry] = flattenChanges(r);
    expect(entry.measureNumber).toBe(5);
    expect(entry.source).toBe("child");
    expect(entry.childKey).toBe("5-note-2");
  });

  it("emits stable, unique ids for every entry", () => {
    const r = emptyResult();
    r.credits.set(0, makeDiff("credit 0"));
    r.measures.set(1, makeDiff("measure 1"));
    r.children.set("1-note-0" as ChildDiffKey, makeDiff("note"));
    const ids = flattenChanges(r).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("countByChangeType", () => {
  it("counts each change type independently", () => {
    const entries = flattenChanges(
      (() => {
        const r = emptyResult();
        r.measures.set(1, makeDiff("m1", "add"));
        r.measures.set(2, makeDiff("m2", "add"));
        r.measures.set(3, makeDiff("m3", "remove"));
        r.measures.set(4, makeDiff("m4", "change"));
        return r;
      })(),
    );
    expect(countByChangeType(entries)).toEqual({ add: 2, remove: 1, change: 1 });
  });

  it("returns zeros for an empty input", () => {
    expect(countByChangeType([])).toEqual({ add: 0, remove: 0, change: 0 });
  });
});
