/**
 * Browser-side MusicXML structural diff.
 *
 * Parses two MusicXML strings with `DOMParser`, locates changed `<measure>`
 * and `<credit>` elements, and produces per-element unified diffs using a
 * Longest Common Subsequence (LCS) algorithm — the same approach used by
 * `git diff --patience`.
 *
 * This runs entirely in the browser without spawning a git process, which
 * makes it suitable for comparing two in-memory XML strings loaded via Vite's
 * `?raw` import.
 */

/** A single line in a unified diff output. */
export type DiffLineType = "add" | "remove" | "context";

/** Discriminated union — line number fields are only present when meaningful. */
export type DiffLine =
  | { type: "remove"; content: string; oldLineNo: number; newLineNo?: never }
  | { type: "add"; content: string; newLineNo: number; oldLineNo?: never }
  | { type: "context"; content: string; oldLineNo: number; newLineNo: number };

export type ChangeType = "add" | "remove" | "change";

/**
 * The computed diff for one XML element (a single `<measure>` or `<credit>`).
 *
 * `lines` is already trimmed to changed lines + surrounding context so it
 * can be rendered directly as a tooltip without further processing.
 */
export type ElementDiff = {
  changeType: ChangeType;
  /** Human-readable label shown in the tooltip header, e.g. `"measure 5"`. */
  label: string;
  lines: DiffLine[];
};

/**
 * Key formats used in {@link XMLDiffResult.children}:
 * - `"${measureNum}-${tagName}-${groupIdx}"` — child of a numbered measure
 * - `"root-${tagName}-${groupIdx}"` — top-level score element
 */
export type ChildDiffKey =
  | `${number}-${string}-${number}`
  | `root-${string}-${number}`;

/**
 * Top-level result returned by {@link diffXML}.
 *
 * - `measures` — keyed by MusicXML `number` attribute (1-based integer).
 *   Empty when `detailedDiff` is on (replaced by `children`).
 * - `credits`  — keyed by document order index (0-based).
 * - `children` — keyed by {@link ChildDiffKey}. Populated only when
 *   `detailedDiff` is enabled; per-tag diffs of direct child elements.
 */
export type XMLDiffResult = {
  measures: Map<number, ElementDiff>;
  credits: Map<number, ElementDiff>;
  partLists: Map<number, ElementDiff>;
  children: Map<ChildDiffKey, ElementDiff>;
};

/**
 * Options that control how the diff is computed.
 * Conceptually mirrors the flags you would pass to `git diff`.
 */
export type XMLDiffOptions = {
  /**
   * Number of unchanged lines to include above and below each changed block.
   * Equivalent to `git diff -U<n>`. Default: `2`.
   */
  contextLines: number;
  /**
   * When `true`, leading/trailing whitespace is stripped before comparing
   * lines. Equivalent to `git diff -w`. Default: `true`.
   */
  ignoreWhitespace: boolean;
  /**
   * Diff algorithm preference. Only applied when using the git-backed
   * {@link getMusicXMLDiff} path (CLI / Bun mode). Has no effect on the
   * browser LCS path. Stored here so the settings panel can persist the
   * value for future git mode support.
   */
  algorithm: "patience" | "histogram" | "myers";
  /**
   * When `true`, each direct child element of a `<measure>` (notes, rests,
   * directions, attributes, etc.) is diffed individually instead of the whole
   * measure being treated as one unit.  SVG overlays are created for `<note>`
   * and `<rest>` children; other tags appear in the git diff / tooltip only.
   */
  detailedDiff: boolean;
};

// ─── LCS implementation ────────────────────────────────────────────────────

/**
 * Build the standard LCS dynamic-programming table for two string arrays.
 *
 * Time: O(m × n) — acceptable for individual XML elements (typically
 * 20–200 lines each). Do not call on the full document.
 *
 * @returns A 2D array `dp` where `dp[i][j]` is the LCS length of
 *          `a[0..i-1]` and `b[0..j-1]`.
 */
function buildLCSTable(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

/**
 * Walk the LCS table back-to-front and produce a flat list of diff lines.
 *
 * Lines present only in `oldLines` → `'remove'`.
 * Lines present only in `newLines` → `'add'`.
 * Lines in both (LCS)             → `'context'`.
 */
function diffLines(oldLines: string[], newLines: string[]): DiffLine[] {
  const dp = buildLCSTable(oldLines, newLines);
  const result: DiffLine[] = [];
  let i = oldLines.length;
  let j = newLines.length;

  // Line numbers are filled in by the caller (elementDiff); use 0 as placeholder.
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({
        type: "context",
        content: oldLines[i - 1],
        oldLineNo: 0,
        newLineNo: 0,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: "add", content: newLines[j - 1], newLineNo: 0 });
      j--;
    } else {
      result.unshift({
        type: "remove",
        content: oldLines[i - 1],
        oldLineNo: 0,
      });
      i--;
    }
  }

  return result;
}

/**
 * Reduce a full diff to only the changed lines plus `context` surrounding
 * lines on each side — identical to `git diff -U<context>`.
 *
 * Gaps between kept ranges are replaced with a single `'...'` context line
 * so the reader can tell content was omitted.
 *
 * @param lines   Full output from {@link diffLines}.
 * @param context Number of context lines to keep around each change.
 */
function trimContext(lines: DiffLine[], context: number): DiffLine[] {
  const changedIndices = new Set<number>();
  lines.forEach((l, i) => {
    if (l.type !== "context") changedIndices.add(i);
  });

  if (changedIndices.size === 0) return [];

  // Expand each changed index by ±context
  const keep = new Set<number>();
  for (const idx of changedIndices) {
    for (
      let k = Math.max(0, idx - context);
      k <= Math.min(lines.length - 1, idx + context);
      k++
    ) {
      keep.add(k);
    }
  }

  const result: DiffLine[] = [];
  let prev = -1;
  for (const idx of [...keep].sort((a, b) => a - b)) {
    if (prev !== -1 && idx > prev + 1) {
      // Indicate skipped lines between two kept ranges (no real line numbers)
      result.push({
        type: "context",
        content: "...",
        oldLineNo: 0,
        newLineNo: 0,
      });
    }
    result.push(lines[idx]);
    prev = idx;
  }
  return result;
}

// ─── Per-element diff helpers ───────────────────────────────────────────────

/**
 * Normalise a line according to the active diff options.
 *
 * When `ignoreWhitespace` is `true` this strips leading/trailing whitespace
 * from each line before comparison — identical to `git diff -w`.  The
 * original content (including whitespace) is preserved in the output so the
 * tooltip still shows the raw XML.
 */
function normaliseLine(line: string, opts: XMLDiffOptions): string {
  return opts.ignoreWhitespace ? line.trim() : line;
}

/**
 * Find the 0-based line index of the Nth occurrence of `searchStr` in `xml`.
 *
 * Returns 0 if not found, so callers get relative line numbers as a fallback.
 * The 0-based index is chosen so callers can do `offset + (1-based element line)`
 * to get the correct 1-based file line number.
 */
function findLineOffset(
  xml: string,
  searchStr: string,
  occurrence = 0,
): number {
  let count = 0;
  let pos = 0;
  while (true) {
    const idx = xml.indexOf(searchStr, pos);
    if (idx === -1) return 0;
    if (count === occurrence) {
      return (xml.slice(0, idx).match(/\n/g) ?? []).length;
    }
    count++;
    pos = idx + 1;
  }
}

/**
 * Compute the diff between two DOM Elements, respecting the provided options.
 *
 * Serialises both elements to string, splits into lines, runs the LCS diff,
 * trims context, and returns an {@link ElementDiff}.
 *
 * @returns `null` when the two elements are identical.
 */
function elementDiff(
  old: Element,
  next: Element,
  label: string,
  opts: XMLDiffOptions,
  offset1 = 0,
  offset2 = 0,
): ElementDiff | null {
  const s1 = new XMLSerializer().serializeToString(old);
  const s2 = new XMLSerializer().serializeToString(next);
  if (s1 === s2) return null;

  // Keep original lines for display but normalise for comparison
  const rawLines1 = s1.split("\n").map((l) => l.trimEnd());
  const rawLines2 = s2.split("\n").map((l) => l.trimEnd());
  const normLines1 = rawLines1.map((l) => normaliseLine(l, opts));
  const normLines2 = rawLines2.map((l) => normaliseLine(l, opts));

  // Diff on normalised lines, then map result back to original content.
  // offset1/offset2 shift element-relative line numbers to file-absolute ones.
  const normalised = diffLines(normLines1, normLines2);
  let r1 = 0; // raw index pointer for old lines (0-based)
  let r2 = 0; // raw index pointer for new lines (0-based)
  const withRaw: DiffLine[] = normalised.map((dl) => {
    if (dl.type === "remove")
      return {
        type: "remove",
        content: rawLines1[r1],
        oldLineNo: offset1 + ++r1,
      };
    if (dl.type === "add")
      return { type: "add", content: rawLines2[r2], newLineNo: offset2 + ++r2 };
    const oldLineNo = offset1 + ++r1;
    const newLineNo = offset2 + ++r2;
    return { type: "context", content: dl.content, oldLineNo, newLineNo };
  });

  return {
    changeType: "change",
    label,
    lines: trimContext(withRaw, opts.contextLines),
  };
}

/**
 * Build an {@link ElementDiff} for an element that exists only in one file.
 *
 * All lines are marked as either `'add'` or `'remove'` — there is no LCS
 * comparison since there is no counterpart element to compare against.
 */
function singleSideDiff(
  el: Element,
  label: string,
  changeType: "add" | "remove",
  offset = 0,
): ElementDiff {
  const raw = new XMLSerializer().serializeToString(el).split("\n");
  const lines: DiffLine[] = raw.map(
    (content, i): DiffLine =>
      changeType === "remove"
        ? { type: "remove", content, oldLineNo: offset + i + 1 }
        : { type: "add", content, newLineNo: offset + i + 1 },
  );
  return { changeType, label, lines };
}

// ─── Detailed diff helpers ──────────────────────────────────────────────────

/**
 * Group a list of elements by their `tagName`, preserving document order
 * within each group.
 *
 * @returns A Map from tag name → ordered array of elements with that tag.
 */
function groupByTag(elements: Element[]): Map<string, Element[]> {
  const map = new Map<string, Element[]>();
  for (const el of elements) {
    const group = map.get(el.tagName);
    if (group) {
      group.push(el);
    } else {
      map.set(el.tagName, [el]);
    }
  }
  return map;
}

/**
 * Diff two sets of elements grouped by tag name.
 *
 * Elements with the same tag are paired by position within that tag group
 * (e.g. the 2nd `<note>` in old vs. the 2nd `<note>` in new), preventing
 * cross-tag comparisons when one side has an extra or missing element type.
 *
 * Keys written into `out` follow the pattern `"${prefix}-${tagName}-${i}"`.
 *
 * @param els1   Direct children from the "old" parent element.
 * @param els2   Direct children from the "new" parent element.
 * @param prefix String prefix for generated keys (e.g. a measure number or `"root"`).
 * @param labelPrefix Human-readable prefix for the diff label.
 * @param opts   Diff options forwarded to {@link elementDiff}.
 * @param out    Map to write results into.
 */
function diffChildrenByTag(
  els1: Element[],
  els2: Element[],
  prefix: string,
  labelPrefix: string,
  opts: XMLDiffOptions,
  out: Map<ChildDiffKey, ElementDiff>,
): void {
  const groups1 = groupByTag(els1);
  const groups2 = groupByTag(els2);
  const allTags = new Set([...groups1.keys(), ...groups2.keys()]);

  for (const tag of allTags) {
    const g1 = groups1.get(tag) ?? [];
    const g2 = groups2.get(tag) ?? [];
    for (let i = 0; i < Math.max(g1.length, g2.length); i++) {
      const c1 = g1[i];
      const c2 = g2[i];
      const label = `${labelPrefix} · ${tag}${g1.length > 1 || g2.length > 1 ? ` ${i + 1}` : ""}`;
      const key = `${prefix}-${tag}-${i}` as ChildDiffKey;
      if (c1 && c2) {
        const d = elementDiff(c1, c2, label, opts);
        if (d) out.set(key, d);
      } else if (c1) {
        out.set(key, singleSideDiff(c1, label, "remove"));
      } else if (c2) {
        out.set(key, singleSideDiff(c2, label, "add"));
      }
    }
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Diff two MusicXML strings and return per-element change maps.
 *
 * Comparison strategy:
 * - `<measure>` elements are matched by their `number` attribute so that
 *   inserted or deleted measures don't shift the alignment of later measures.
 * - `<credit>` elements are matched by document-order index. Credits rarely
 *   change count between versions, and they have no stable identity key.
 *
 * @param xml1  Raw MusicXML string for the "old" (left) score.
 * @param xml2  Raw MusicXML string for the "new" (right) score.
 * @param opts  Diff behaviour options.
 *
 * @example
 * ```ts
 * const result = diffXML(oldXml, newXml, { contextLines: 3, ignoreWhitespace: true });
 * for (const [num, diff] of result.measures) {
 *   console.log(`measure ${num}:`, diff.changeType);
 * }
 * ```
 */
export function diffXML(
  xml1: string,
  xml2: string,
  opts: XMLDiffOptions,
): XMLDiffResult {
  const parser = new DOMParser();
  const doc1 = parser.parseFromString(xml1, "application/xml");
  const doc2 = parser.parseFromString(xml2, "application/xml");

  const measures = new Map<number, ElementDiff>();
  const credits = new Map<number, ElementDiff>();
  const children = new Map<ChildDiffKey, ElementDiff>();
  const partLists = new Map<number, ElementDiff>();

  // ── Measures ──────────────────────────────────────────────────────────
  // Index by `number` attribute so insertions/deletions don't mis-align.
  const measureMap1 = new Map<number, Element>();
  const measureMap2 = new Map<number, Element>();

  doc1
    .querySelectorAll("measure")
    .forEach((m) =>
      measureMap1.set(parseInt(m.getAttribute("number") ?? "0", 10), m),
    );
  doc2
    .querySelectorAll("measure")
    .forEach((m) =>
      measureMap2.set(parseInt(m.getAttribute("number") ?? "0", 10), m),
    );

  for (const num of new Set([...measureMap1.keys(), ...measureMap2.keys()])) {
    const m1 = measureMap1.get(num);
    const m2 = measureMap2.get(num);

    if (m1 && m2 && opts.detailedDiff) {
      // ── Detailed mode: diff per-tag groups within the measure ──────────
      // Children are grouped by tag name so that e.g. <attributes> is never
      // paired against a <note> due to an index shift.
      diffChildrenByTag(
        Array.from(m1.children),
        Array.from(m2.children),
        String(num),
        `measure ${num}`,
        opts,
        children,
      );
    } else if (m1 && m2) {
      const o1 = findLineOffset(xml1, `<measure number="${num}"`);
      const o2 = findLineOffset(xml2, `<measure number="${num}"`);
      const d = elementDiff(m1, m2, `measure ${num}`, opts, o1, o2);
      if (d) measures.set(num, d);
    } else if (m1) {
      const o1 = findLineOffset(xml1, `<measure number="${num}"`);
      measures.set(num, singleSideDiff(m1, `measure ${num}`, "remove", o1));
    } else if (m2) {
      const o2 = findLineOffset(xml2, `<measure number="${num}"`);
      measures.set(num, singleSideDiff(m2, `measure ${num}`, "add", o2));
    }
  }

  // ── Credits ───────────────────────────────────────────────────────────
  // Matched by position — credits have no stable identity attribute.
  const credits1 = Array.from(doc1.querySelectorAll("credit"));
  const credits2 = Array.from(doc2.querySelectorAll("credit"));

  for (let i = 0; i < Math.max(credits1.length, credits2.length); i++) {
    const c1 = credits1[i];
    const c2 = credits2[i];

    if (c1 && c2) {
      const o1 = findLineOffset(xml1, "<credit", i);
      const o2 = findLineOffset(xml2, "<credit", i);
      const d = elementDiff(c1, c2, `credit ${i}`, opts, o1, o2);
      if (d) credits.set(i, d);
    } else if (c1) {
      const o1 = findLineOffset(xml1, "<credit", i);
      credits.set(i, singleSideDiff(c1, `credit ${i}`, "remove", o1));
    } else if (c2) {
      const o2 = findLineOffset(xml2, "<credit", i);
      credits.set(i, singleSideDiff(c2, `credit ${i}`, "add", o2));
    }
  }

  const partLists1 = Array.from(doc1.querySelectorAll("part-list"));
  const partLists2 = Array.from(doc2.querySelectorAll("part-list"));

  for (let i = 0; i < Math.max(partLists1.length, partLists2.length); i++) {
    const p1 = partLists1[i];
    const p2 = partLists2[i];

    if (p1 && p2) {
      const o1 = findLineOffset(xml1, "<part-list", i);
      const o2 = findLineOffset(xml2, "<part-list", i);
      const d = elementDiff(p1, p2, `part-list ${i}`, opts, o1, o2);
      if (d) partLists.set(i, d);
    } else if (p1) {
      const o1 = findLineOffset(xml1, "<part-list", i);
      partLists.set(i, singleSideDiff(p1, `part-list ${i}`, "remove", o1));
    } else if (p2) {
      const o2 = findLineOffset(xml2, "<part-list", i);
      partLists.set(i, singleSideDiff(p2, `part-list ${i}`, "add", o2));
    }
  }
  // ── Top-level elements (detailed mode only) ───────────────────────────
  // Diffs direct children of the root <score-partwise> / <score-timewise>
  // element that aren't already handled: excludes <credit> (handled above)
  // and <part> (contains measures, handled above).
  if (opts.detailedDiff) {
    const SKIP = new Set(["credit", "part"]);
    const rootKids1 = Array.from(doc1.documentElement.children).filter(
      (el) => !SKIP.has(el.tagName),
    );
    const rootKids2 = Array.from(doc2.documentElement.children).filter(
      (el) => !SKIP.has(el.tagName),
    );
    diffChildrenByTag(rootKids1, rootKids2, "root", "score", opts, children);
  }

  return { measures, credits, partLists, children };
}
