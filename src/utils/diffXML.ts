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
 * One human-readable field change inside a `<note>` element.
 *
 * Produced by {@link summariseNoteDiff} when both sides of a diff are `<note>`
 * elements that differ in a recognised semantic field (pitch, duration, voice,
 * type, stem, lyric).  Rendered at the top of the diff tooltip so musicians
 * see "pitch: C4 -> E4" instead of having to read raw XML.
 */
export type NoteFieldChange = {
  /** Field name shown to the user, e.g. `"pitch"`, `"duration"`. */
  field: string;
  /** Old value, or `"(none)"` when the field was absent on the old side. */
  before: string;
  /** New value, or `"(none)"` when the field is absent on the new side. */
  after: string;
};

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
  /**
   * Optional list of recognised field-level changes when both sides of the
   * diff are `<note>` elements.  Absent for non-note elements and for note
   * diffs that didn't match any recognised field (e.g. attributes-only).
   */
  summary?: NoteFieldChange[];
};

/**
 * Key formats used in {@link XMLDiffResult.children}:
 * - `"${measureNum}-${tagName}-${groupIdx}"` — child of a numbered measure
 * - `"root-${tagName}-${groupIdx}"` — top-level score element
 */
export type ChildDiffKey = `${number}-${string}-${number}` | `root-${string}-${number}`;

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
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
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
    for (let k = Math.max(0, idx - context); k <= Math.min(lines.length - 1, idx + context); k++) {
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
function findLineOffset(xml: string, searchStr: string, occurrence = 0): number {
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
 * Extract the raw XML substring for the Nth occurrence of an element.
 *
 * Used when `ignoreWhitespace: false` to bypass DOMParser normalisation —
 * DOMParser silently discards insignificant whitespace text nodes, so
 * `XMLSerializer` round-trips cannot preserve indent-only differences.
 * Comparing raw input substrings directly is the only reliable fix.
 *
 * @param xml        Full raw XML input string.
 * @param openSearch String that uniquely starts the element (e.g. `'<measure number="1"'`).
 * @param closeTag   Closing tag string (e.g. `'</measure>'`).
 * @param occurrence 0-based index when multiple elements share the same open pattern.
 * @returns The raw substring from the opening tag through its closing tag, or `""` if not found.
 */
function sliceElement(xml: string, openSearch: string, closeTag: string, occurrence = 0): string {
  let count = 0;
  let pos = 0;
  while (true) {
    const start = xml.indexOf(openSearch, pos);
    if (start === -1) return "";
    if (count === occurrence) {
      const end = xml.indexOf(closeTag, start);
      return end === -1 ? xml.slice(start) : xml.slice(start, end + closeTag.length);
    }
    count++;
    pos = start + 1;
  }
}

/**
 * Compute the diff between two DOM Elements, respecting the provided options.
 *
 * Serialises both elements to string, splits into lines, runs the LCS diff,
 * trims context, and returns an {@link ElementDiff}.
 *
 * When `ignoreWhitespace` is `false` and `rawStr1`/`rawStr2` are provided,
 * the raw input substrings are used instead of re-serialising via XMLSerializer.
 * This is required because DOMParser normalises insignificant whitespace during
 * parsing, so XMLSerializer cannot recover indent-only differences from the DOM.
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
  rawStr1?: string,
  rawStr2?: string,
): ElementDiff | null {
  const useRaw = !opts.ignoreWhitespace && rawStr1 !== undefined && rawStr2 !== undefined;
  const s1 = useRaw ? rawStr1 : new XMLSerializer().serializeToString(old);
  const s2 = useRaw ? rawStr2 : new XMLSerializer().serializeToString(next);
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

  const trimmed = trimContext(withRaw, opts.contextLines);
  // All differences were normalised away (e.g. whitespace-only with ignoreWhitespace: true)
  if (trimmed.length === 0) return null;

  // When both sides are <note> elements, attach a human-readable field-level
  // summary so the tooltip can show "pitch: C4 -> E4" above the raw lines.
  const result: ElementDiff = { changeType: "change", label, lines: trimmed };
  if (old.tagName === "note" && next.tagName === "note") {
    const summary = summariseNoteDiff(old, next);
    if (summary.length > 0) result.summary = summary;
  }
  return result;
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

// ─── Note-level field summary ──────────────────────────────────────────────

/**
 * Read the trimmed text content of the first matching child, or `null` if no
 * such child exists. Centralised so each field extractor stays a one-liner.
 */
function childText(parent: Element, selector: string): string | null {
  const el = parent.querySelector(selector);
  if (!el) return null;
  const text = el.textContent?.trim();
  return text ? text : null;
}

/**
 * Format a `<pitch>` element as a human note name like `"C#4"` or `"Eb5"`.
 *
 * Alter mapping follows MusicXML 4.0:
 *   1  -> sharp        2  -> double sharp
 *  -1  -> flat        -2  -> double flat
 *   0 or missing      -> natural (no accidental glyph)
 *
 * Returns `null` if the element isn't a recognisable pitch (no step). Quarter
 * tones (alter 0.5 etc.) are emitted verbatim as e.g. "C0.5/4" — we keep the
 * raw alter so users can see the value rather than silently dropping it.
 */
function formatPitch(pitchEl: Element): string | null {
  const step = childText(pitchEl, "step");
  if (!step) return null;
  const octave = childText(pitchEl, "octave") ?? "?";
  const alterStr = childText(pitchEl, "alter");
  const alter = alterStr === null ? 0 : Number(alterStr);
  let accidental: string;
  if (alter === 1) accidental = "#";
  else if (alter === -1) accidental = "b";
  else if (alter === 2) accidental = "##";
  else if (alter === -2) accidental = "bb";
  else if (alter === 0) accidental = "";
  else accidental = `(${alterStr})`;
  return `${step}${accidental}${octave}`;
}

/**
 * Read a single semantic field from a `<note>` element and return it as a
 * normalised string suitable for showing in the tooltip.
 *
 * Returns `null` when the field is absent so callers can distinguish "the
 * field was added/removed" from "the field changed".
 */
type NoteFieldReader = (note: Element) => string | null;

const NOTE_FIELDS: ReadonlyArray<{ field: string; read: NoteFieldReader }> = [
  {
    field: "pitch",
    read: (note) => {
      const pitch = note.querySelector("pitch");
      if (pitch) return formatPitch(pitch);
      if (note.querySelector("rest")) return "rest";
      const unpitched = note.querySelector("unpitched");
      if (unpitched) {
        const step = childText(unpitched, "display-step");
        const oct = childText(unpitched, "display-octave");
        if (step) return `unpitched ${step}${oct ?? ""}`;
      }
      return null;
    },
  },
  { field: "duration", read: (note) => childText(note, "duration") },
  { field: "voice", read: (note) => childText(note, "voice") },
  { field: "type", read: (note) => childText(note, "type") },
  { field: "stem", read: (note) => childText(note, "stem") },
  {
    field: "lyric",
    read: (note) => {
      const lyric = note.querySelector("lyric");
      return lyric ? childText(lyric, "text") : null;
    },
  },
];

/**
 * Walk a pair of `<note>` elements and produce a list of recognised
 * field-level differences. Returns an empty array when no recognised field
 * changed (caller should leave `summary` undefined in that case).
 *
 * Only emits an entry when the field actually differs between sides; absent
 * vs. absent collapses to no entry.
 */
export function summariseNoteDiff(oldNote: Element, newNote: Element): NoteFieldChange[] {
  const changes: NoteFieldChange[] = [];
  for (const { field, read } of NOTE_FIELDS) {
    const before = read(oldNote);
    const after = read(newNote);
    if (before === after) continue;
    changes.push({
      field,
      before: before ?? "(none)",
      after: after ?? "(none)",
    });
  }
  return changes;
}

// ─── diffElementList helper ────────────────────────────────────────────────

/**
 * Configuration for one pass of {@link diffElementList}.
 *
 * `K` is the map key type (`number` for all current callers).
 */
interface ElementListConfig<K> {
  xml1: string;
  xml2: string;
  /** All elements from the "old" document that belong to this group. */
  els1: Element[];
  /** All elements from the "new" document that belong to this group. */
  els2: Element[];
  /**
   * Extract the iteration key for a given element.
   * For position-keyed lists (credits, partLists) this is just the array index.
   * For measure elements it is the parsed `number` attribute.
   */
  keyOf: (el: Element, idx: number) => K;
  /**
   * Build the opening search string used by {@link findLineOffset} and
   * {@link sliceElement} for this key.
   */
  openPattern: (key: K) => string;
  /**
   * Occurrence index for `findLineOffset` / `sliceElement` when multiple
   * elements share the same `openPattern` string. Defaults to `0` (first
   * match). Required when `openPattern` is a fixed string and the document
   * contains multiple elements with that same opening (e.g. several
   * `<credit>` or `<part-list>` elements). Without this, every credit
   * would resolve to the first credit's line offset and raw slice.
   */
  occurrence?: (key: K) => number;
  /** Closing tag string, e.g. `"</measure>"`. */
  closeTag: string;
  /** Human-readable label inserted into the tooltip header. */
  labelFor: (key: K) => string;
  opts: XMLDiffOptions;
  /** Output map — results are written here. */
  out: Map<K, ElementDiff>;
  /**
   * Optional hook called instead of the standard elementDiff when both sides
   * exist. Used by the measure loop in detailedDiff mode to delegate to
   * {@link diffChildrenByTag} rather than diffing the whole element.
   * When the hook returns `true` the main loop skips its own elementDiff call.
   */
  detailedDiffChildren?: (el1: Element, el2: Element, key: K) => boolean;
}

/**
 * Run the find-match-diff loop for one category of XML elements.
 *
 * Deduplicates the three near-identical loops that previously existed inline
 * inside `diffXML` (measures, credits, partLists). Each caller supplies a
 * config that describes how to key, open-pattern, close-tag, and label its
 * elements; the loop logic is identical across all three.
 */
function diffElementList<K>({
  xml1,
  xml2,
  els1,
  els2,
  keyOf,
  openPattern,
  occurrence,
  closeTag,
  labelFor,
  opts,
  out,
  detailedDiffChildren,
}: ElementListConfig<K>): void {
  // Build a unified key set that covers both sides so additions/removals are caught.
  const keys = new Set<K>();
  const map1 = new Map<K, Element>();
  const map2 = new Map<K, Element>();
  for (let i = 0; i < els1.length; i++) {
    const key = keyOf(els1[i], i);
    keys.add(key);
    map1.set(key, els1[i]);
  }
  for (let i = 0; i < els2.length; i++) {
    const key = keyOf(els2[i], i);
    keys.add(key);
    map2.set(key, els2[i]);
  }

  for (const key of keys) {
    const e1 = map1.get(key);
    const e2 = map2.get(key);
    const label = labelFor(key);
    const open = openPattern(key);
    const occ = occurrence?.(key) ?? 0;

    if (e1 && e2) {
      if (detailedDiffChildren?.(e1, e2, key)) continue;
      const o1 = findLineOffset(xml1, open, occ);
      const o2 = findLineOffset(xml2, open, occ);
      const r1 = opts.ignoreWhitespace ? undefined : sliceElement(xml1, open, closeTag, occ);
      const r2 = opts.ignoreWhitespace ? undefined : sliceElement(xml2, open, closeTag, occ);
      const d = elementDiff(e1, e2, label, opts, o1, o2, r1, r2);
      if (d) out.set(key, d);
    } else if (e1) {
      const o1 = findLineOffset(xml1, open, occ);
      out.set(key, singleSideDiff(e1, label, "remove", o1));
    } else if (e2) {
      const o2 = findLineOffset(xml2, open, occ);
      out.set(key, singleSideDiff(e2, label, "add", o2));
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
export function diffXML(xml1: string, xml2: string, opts: XMLDiffOptions): XMLDiffResult {
  const parser = new DOMParser();
  const doc1 = parser.parseFromString(xml1, "application/xml");
  const doc2 = parser.parseFromString(xml2, "application/xml");

  const measures = new Map<number, ElementDiff>();
  const credits = new Map<number, ElementDiff>();
  const partLists = new Map<number, ElementDiff>();
  const children = new Map<ChildDiffKey, ElementDiff>();

  // In detailedDiff mode the measure loop delegates to per-tag child diffing
  // rather than diffing the whole measure element.
  const measureDetailedHook: ElementListConfig<number>["detailedDiffChildren"] = opts.detailedDiff
    ? (m1, m2, num) => {
        diffChildrenByTag(
          Array.from(m1.children),
          Array.from(m2.children),
          String(num),
          `measure ${num}`,
          opts,
          children,
        );
        return true;
      }
    : undefined;

  // ── Measures — keyed by `number` attribute ────────────────────────────
  diffElementList<number>({
    xml1,
    xml2,
    els1: Array.from(doc1.querySelectorAll("measure")),
    els2: Array.from(doc2.querySelectorAll("measure")),
    keyOf: (el) => Number.parseInt(el.getAttribute("number") ?? "0", 10),
    openPattern: (num) => `<measure number="${num}"`,
    closeTag: "</measure>",
    labelFor: (num) => `measure ${num}`,
    opts,
    out: measures,
    detailedDiffChildren: measureDetailedHook,
  });

  // ── Credits — matched by position (no stable identity attribute) ──────
  // `openPattern` is "<credit " (trailing space) rather than "<credit" to
  // avoid matching the `<credit-type>` and `<credit-words>` child elements
  // — MusicXML requires every `<credit>` to carry the `page` attribute, so
  // a space after the tag name uniquely identifies the wrapper. `occurrence`
  // is the positional index so the Nth credit resolves to the Nth match.
  diffElementList<number>({
    xml1,
    xml2,
    els1: Array.from(doc1.querySelectorAll("credit")),
    els2: Array.from(doc2.querySelectorAll("credit")),
    keyOf: (_el, i) => i,
    openPattern: () => "<credit ",
    occurrence: (i) => i,
    closeTag: "</credit>",
    labelFor: (i) => `credit ${i}`,
    opts,
    out: credits,
  });

  // ── Part-lists ────────────────────────────────────────────────────────
  // `<part-list>` appears without attributes in MusicXML, so the closing-`>`
  // form is the precise pattern (avoids matching `<part-link>` if present).
  diffElementList<number>({
    xml1,
    xml2,
    els1: Array.from(doc1.querySelectorAll("part-list")),
    els2: Array.from(doc2.querySelectorAll("part-list")),
    keyOf: (_el, i) => i,
    openPattern: () => "<part-list>",
    occurrence: (i) => i,
    closeTag: "</part-list>",
    labelFor: (i) => `part-list ${i}`,
    opts,
    out: partLists,
  });

  // ── Top-level elements (detailedDiff only) ────────────────────────────
  // Excludes <credit> and <part> — both are already handled above.
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
