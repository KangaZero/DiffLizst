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

export type DiffLine = {
  type: DiffLineType;
  /** Raw text content of the line (no leading `+`/`-`/` ` prefix). */
  content: string;
};

/**
 * The computed diff for one XML element (a single `<measure>` or `<credit>`).
 *
 * `lines` is already trimmed to changed lines + surrounding context so it
 * can be rendered directly as a tooltip without further processing.
 */
export type ElementDiff = {
  changeType: "add" | "remove" | "change";
  /** Human-readable label shown in the tooltip header, e.g. `"measure 5"`. */
  label: string;
  lines: DiffLine[];
};

/**
 * Top-level result returned by {@link diffXML}.
 *
 * - `measures` — keyed by MusicXML `number` attribute (1-based integer).
 * - `credits`  — keyed by document order index (0-based).
 */
export type XMLDiffResult = {
  measures: Map<number, ElementDiff>;
  credits: Map<number, ElementDiff>;
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

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.unshift({ type: "context", content: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: "add", content: newLines[j - 1] });
      j--;
    } else {
      result.unshift({ type: "remove", content: oldLines[i - 1] });
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
      // Indicate skipped lines between two kept ranges
      result.push({ type: "context", content: "..." });
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
): ElementDiff | null {
  const s1 = new XMLSerializer().serializeToString(old);
  const s2 = new XMLSerializer().serializeToString(next);
  if (s1 === s2) return null;

  // Keep original lines for display but normalise for comparison
  const rawLines1 = s1.split("\n").map((l) => l.trimEnd());
  const rawLines2 = s2.split("\n").map((l) => l.trimEnd());
  const normLines1 = rawLines1.map((l) => normaliseLine(l, opts));
  const normLines2 = rawLines2.map((l) => normaliseLine(l, opts));

  // Diff on normalised lines, then map result back to original content
  const normalised = diffLines(normLines1, normLines2);
  let r1 = 0; // raw index pointer for old lines
  let r2 = 0; // raw index pointer for new lines
  const withRaw: DiffLine[] = normalised.map((dl) => {
    if (dl.type === "remove")
      return { type: "remove", content: rawLines1[r1++] };
    if (dl.type === "add") return { type: "add", content: rawLines2[r2++] };
    r1++;
    r2++;
    return { type: "context", content: dl.content };
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
): ElementDiff {
  const lines = new XMLSerializer()
    .serializeToString(el)
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => ({ type: changeType, content: l }));
  return { changeType, label, lines };
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

    if (m1 && m2) {
      const d = elementDiff(m1, m2, `measure ${num}`, opts);
      if (d) measures.set(num, d);
    } else if (m1) {
      measures.set(num, singleSideDiff(m1, `measure ${num}`, "remove"));
    } else if (m2) {
      measures.set(num, singleSideDiff(m2, `measure ${num}`, "add"));
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
      const d = elementDiff(c1, c2, `credit ${i}`, opts);
      if (d) credits.set(i, d);
    } else if (c1) {
      credits.set(i, singleSideDiff(c1, `credit ${i}`, "remove"));
    } else if (c2) {
      credits.set(i, singleSideDiff(c2, `credit ${i}`, "add"));
    }
  }

  return { measures, credits };
}
