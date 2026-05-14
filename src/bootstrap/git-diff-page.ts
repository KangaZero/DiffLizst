import type { DiffSettingsValue } from "@/components/diffSettings";
import type { ElementDiff, DiffLine, XMLDiffResult } from "@/utils/diffXML";

// ─── HTML helpers ────────────────────────────────────────────────────────────

/** Escape `<`, `>`, `&` for safe HTML text injection. */
export function escapeHTML(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Build a cell for one side of a split-view row.
 *
 * @param line The diff line to render, or `undefined` for an empty cell
 *             (shown when one side has no paired counterpart).
 */
export function splitCellHTML(
  line: DiffLine | undefined,
  side: "old" | "new",
  showLineNumbers: boolean,
): string {
  const lineNo = showLineNumbers
    ? `<span class="diff-page-gutter diff-line-no">${side === "old" ? (line?.oldLineNo ?? "?") : (line?.newLineNo ?? "?")}</span>`
    : "";
  if (!line) {
    return `<div class="diff-split-cell diff-line-empty">${lineNo}</div>`;
  }
  const glyph = line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";
  return (
    `<div class="diff-split-cell diff-line-${line.type}">` +
    lineNo +
    `<span class="diff-page-gutter">${glyph}</span>` +
    `<span class="diff-page-code">${escapeHTML(line.content)}</span>` +
    `</div>`
  );
}

/**
 * Render one element diff hunk as a unified (single-column) block.
 */
export function unifiedHunkHTML(
  diff: ElementDiff,
  showLineNumbers: boolean,
): string {
  const linesHTML = diff.lines
    .map((l) => {
      const glyph = l.type === "add" ? "+" : l.type === "remove" ? "-" : " ";
      const lineNosHTML = showLineNumbers
        ? `<span class="diff-page-gutter diff-line-no">${l.oldLineNo ?? ""}</span>` +
          `<span class="diff-page-gutter diff-line-no">${l.newLineNo ?? ""}</span>`
        : "";
      return (
        `<div class="diff-page-line diff-line-${l.type}">` +
        lineNosHTML +
        `<span class="diff-page-gutter">${glyph}</span>` +
        `<span class="diff-page-code">${escapeHTML(l.content)}</span>` +
        `</div>`
      );
    })
    .join("");
  return `<div class="diff-hunk-header">@@ ${diff.label} @@</div>${linesHTML}`;
}

/**
 * Render one element diff hunk as a side-by-side (split) block.
 *
 * Consecutive remove/add runs are paired so a deletion and its corresponding
 * insertion appear on the same row. Unpaired removes get an empty right cell;
 * unpaired adds get an empty left cell.
 */
export function splitHunkHTML(
  diff: ElementDiff,
  showLineNumbers: boolean,
): string {
  type SplitRow =
    | { kind: "context"; line: DiffLine }
    | { kind: "change"; remove?: DiffLine; add?: DiffLine };

  const rows: SplitRow[] = [];
  let i = 0;
  while (i < diff.lines.length) {
    const l = diff.lines[i];
    if (l.type === "context") {
      rows.push({ kind: "context", line: l });
      i++;
    } else {
      const removes: DiffLine[] = [];
      const adds: DiffLine[] = [];
      while (i < diff.lines.length && diff.lines[i].type === "remove")
        removes.push(diff.lines[i++]);
      while (i < diff.lines.length && diff.lines[i].type === "add")
        adds.push(diff.lines[i++]);
      const len = Math.max(removes.length, adds.length);
      for (let j = 0; j < len; j++) {
        rows.push({ kind: "change", remove: removes[j], add: adds[j] });
      }
    }
  }

  const rowsHTML = rows
    .map((row) => {
      if (row.kind === "context") {
        const code = escapeHTML(row.line.content);
        const lineNoOld = showLineNumbers
          ? `<span class="diff-page-gutter diff-line-no">${row.line.oldLineNo ?? ""}</span>`
          : "";
        const lineNoNew = showLineNumbers
          ? `<span class="diff-page-gutter diff-line-no">${row.line.newLineNo ?? ""}</span>`
          : "";
        return (
          `<div class="diff-split-row">` +
          `<div class="diff-split-cell diff-line-context">${lineNoOld}<span class="diff-page-gutter"> </span><span class="diff-page-code">${code}</span></div>` +
          `<div class="diff-split-cell diff-line-context">${lineNoNew}<span class="diff-page-gutter"> </span><span class="diff-page-code">${code}</span></div>` +
          `</div>`
        );
      }
      return (
        `<div class="diff-split-row">` +
        splitCellHTML(row.remove, "old", showLineNumbers) +
        splitCellHTML(row.add, "new", showLineNumbers) +
        `</div>`
      );
    })
    .join("");

  return `<div class="diff-hunk-header">@@ ${diff.label} @@</div>${rowsHTML}`;
}

// ─── Render ───────────────────────────────────────────────────────────────────

/**
 * Render the git diff page in either unified or split mode.
 * Credits first, measures in ascending order, then child diffs.
 */
export function renderGitDiffPage(
  xmlDiff: XMLDiffResult | null,
  hunksEl: HTMLElement,
  settings: DiffSettingsValue,
): void {
  const hasChanges =
    xmlDiff &&
    (xmlDiff.measures.size > 0 ||
      xmlDiff.credits.size > 0 ||
      xmlDiff.children.size > 0);

  if (!xmlDiff || !hasChanges) {
    hunksEl.innerHTML = `<p class="diff-page-empty">No differences found between the two scores.</p>`;
    return;
  }

  const isSplit = settings.gitDiffOrientation === "split";
  const hunkFn = isSplit
    ? (d: ElementDiff) => splitHunkHTML(d, settings.showLineNumbers)
    : (d: ElementDiff) => unifiedHunkHTML(d, settings.showLineNumbers);

  const creditHunks = [...xmlDiff.credits.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, d]) => hunkFn(d))
    .join("");

  const measureHunks = [...xmlDiff.measures.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, d]) => hunkFn(d))
    .join("");

  const childHunks = [...xmlDiff.children.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, d]) => hunkFn(d))
    .join("");

  hunksEl.innerHTML = creditHunks + measureHunks + childHunks;
  hunksEl.classList.toggle("is-split", isSplit);
}

// ─── Split-toggle wiring ─────────────────────────────────────────────────────

/**
 * Wire the git diff split/unified toggle button.
 *
 * @param btn           The `#git-diff-split-toggle` button.
 * @param diffSettingsEl The `<diff-settings>` element (to sync its UI state).
 * @param getState      Read current settings from main.ts.
 * @param setState      Write updated settings back to main.ts.
 * @param onToggle      Called after state is updated so main.ts can re-render.
 */
export function wireGitDiffSplitToggle(
  btn: HTMLButtonElement,
  diffSettingsEl: HTMLElement,
  getState: () => DiffSettingsValue,
  setState: (s: DiffSettingsValue) => void,
  onToggle: () => void,
): void {
  btn.addEventListener("click", () => {
    const current = getState();
    const next =
      current.gitDiffOrientation === "split" ? "unified" : "split";
    const updated: DiffSettingsValue = {
      ...current,
      gitDiffOrientation: next,
    };
    setState(updated);
    // Push the change back into the settings panel so the gear UI stays in sync
    (diffSettingsEl as unknown as { value: DiffSettingsValue }).value = updated;
    btn.setAttribute("aria-pressed", String(next === "split"));
    btn.textContent = next === "split" ? "Unified" : "Split";
    onToggle();
  });
}
