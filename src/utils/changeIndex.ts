/**
 * Flatten the multi-map shape of `XMLDiffResult` into a single ordered array
 * of changes so the UI can drive next/prev navigation, a summary sidebar,
 * and an "N of M" indicator without re-traversing each map every keypress.
 *
 * Ordering rules (musicians read scores left-to-right, top-to-bottom):
 *   1. Credits first (they're page-header metadata, visually at the top).
 *   2. Part-list entries next (instrument labels, still pre-music).
 *   3. Measures in ascending number order. Children inside a measure
 *      follow it, also in document order.
 *   4. Root-level extras (e.g. <work-title>) at the end.
 *
 * Each entry carries the original ElementDiff plus a stable category so the
 * sidebar can filter by add/remove/change and the change-navigator can scroll
 * the right pane.
 */

import type { ChildDiffKey, ElementDiff, XMLDiffResult } from "./diffXML";

/** One entry in the flat ordered change list. */
export type ChangeEntry = {
  /** Stable identifier — unique within a single XMLDiffResult. */
  id: string;
  /** Which top-level bucket this came from. */
  source: "credit" | "partList" | "measure" | "child" | "rootChild";
  /** Parent measure number, when the entry belongs to a measure or its child. */
  measureNumber?: number;
  /** Original ChildDiffKey when the entry came from `children`. */
  childKey?: ChildDiffKey;
  /** Direct reference to the underlying diff for tooltip rendering / clicks. */
  diff: ElementDiff;
};

/** Sort helper: extract measure number from a ChildDiffKey of shape "N-tag-idx". */
function measureNumberOfChildKey(key: ChildDiffKey): number | null {
  const m = key.match(/^(\d+)-/);
  return m ? Number.parseInt(m[1], 10) : null;
}

/** Extract child index (the trailing 0-based int) from a ChildDiffKey. */
function childIndexOfKey(key: ChildDiffKey): number {
  const m = key.match(/-(\d+)$/);
  return m ? Number.parseInt(m[1], 10) : 0;
}

/**
 * Extract the tag name segment from a ChildDiffKey.
 *
 * Keys look like `"${prefix}-${tagName}-${idx}"`. Hyphenated MusicXML tag
 * names (`work-title`, `part-list`, `score-instrument`, `figured-bass`) are
 * common, so we cannot just take `split("-")[1]` — it would return `"work"`
 * instead of `"work-title"`. Match everything between the leading prefix and
 * the trailing index segment.
 */
function tagOfChildKey(key: ChildDiffKey): string {
  const m = key.match(/^[^-]+-(.+)-\d+$/);
  return m ? m[1] : "";
}

/**
 * Produce a flat, ordered list of every change in a diff result.
 *
 * Time: O(C + P + M + K) where C/P/M/K are credit/partList/measure/child counts.
 * The output is suitable for keyboard nav (`next()` / `prev()`), sidebar
 * rendering, and counting changes by type.
 */
export function flattenChanges(diff: XMLDiffResult | null): ChangeEntry[] {
  if (!diff) return [];
  const entries: ChangeEntry[] = [];

  // 1. Credits — keyed by document position (0-based).
  const creditKeys = [...diff.credits.keys()].sort((a, b) => a - b);
  for (const k of creditKeys) {
    const d = diff.credits.get(k);
    if (!d) continue;
    entries.push({ id: `credit-${k}`, source: "credit", diff: d });
  }

  // 2. Part-list entries — same ordering rule.
  const partListKeys = [...diff.partLists.keys()].sort((a, b) => a - b);
  for (const k of partListKeys) {
    const d = diff.partLists.get(k);
    if (!d) continue;
    entries.push({ id: `partList-${k}`, source: "partList", diff: d });
  }

  // 3. Measures in ascending number order. Children of each measure follow it
  //    in document order (sort by tag then numeric child index for stability).
  const measureNumbers = [...diff.measures.keys()].sort((a, b) => a - b);

  // Pre-bucket children by parent measure number so the inner loop is O(1).
  const childrenByMeasure = new Map<number, ChildDiffKey[]>();
  const rootChildKeys: ChildDiffKey[] = [];
  for (const k of diff.children.keys()) {
    const m = measureNumberOfChildKey(k);
    if (m === null) {
      rootChildKeys.push(k);
    } else {
      const list = childrenByMeasure.get(m) ?? [];
      list.push(k);
      childrenByMeasure.set(m, list);
    }
  }

  // Sort each bucket by tag then child index — gives deterministic order
  // across DOMParser implementations (which don't guarantee map iteration).
  function sortChildKeys(keys: ChildDiffKey[]): ChildDiffKey[] {
    return keys.sort((a, b) => {
      const tagCmp = tagOfChildKey(a).localeCompare(tagOfChildKey(b));
      return tagCmp !== 0 ? tagCmp : childIndexOfKey(a) - childIndexOfKey(b);
    });
  }

  // Process measures in the union of (parent measures + measures that only
  // appear as a key under children/). This catches detailedDiff: true, where
  // diff.measures is empty but the children map carries per-measure entries.
  const allMeasureNumbers = new Set<number>([...measureNumbers, ...childrenByMeasure.keys()]);
  for (const num of [...allMeasureNumbers].sort((a, b) => a - b)) {
    const parent = diff.measures.get(num);
    if (parent) {
      entries.push({ id: `measure-${num}`, source: "measure", measureNumber: num, diff: parent });
    }
    const childKeys = childrenByMeasure.get(num);
    if (!childKeys) continue;
    for (const key of sortChildKeys(childKeys)) {
      const d = diff.children.get(key);
      if (!d) continue;
      entries.push({
        id: `child-${key}`,
        source: "child",
        measureNumber: num,
        childKey: key,
        diff: d,
      });
    }
  }

  // 4. Root-level children last (work-title, identification, etc.).
  for (const key of sortChildKeys(rootChildKeys)) {
    const d = diff.children.get(key);
    if (!d) continue;
    entries.push({ id: `root-${key}`, source: "rootChild", childKey: key, diff: d });
  }

  return entries;
}

/**
 * Bucket the flattened changes by type for the summary sidebar headline.
 */
export function countByChangeType(entries: ChangeEntry[]): {
  add: number;
  remove: number;
  change: number;
} {
  let add = 0;
  let remove = 0;
  let change = 0;
  for (const e of entries) {
    if (e.diff.changeType === "add") add++;
    else if (e.diff.changeType === "remove") remove++;
    else change++;
  }
  return { add, remove, change };
}
