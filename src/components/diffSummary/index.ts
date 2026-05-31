/**
 * Diff summary sidebar wiring.
 *
 * Renders the flat change list into a clickable list, shows counts of
 * added/removed/changed entries, exposes filter chips for each type, and
 * persists its open/closed state across reloads.
 *
 * Also renders a collapsible "Score statistics" section sourced from
 * `computeScoreStats` — shown after the changes list.
 *
 * Kept as a plain wiring module (not a Web Component) because every input
 * — the flat change list, the focus callback, the counts — already lives
 * in main.ts and would otherwise have to be funneled through attributes or
 * a shared store for no readability benefit.
 */

import { type ChangeEntry, countByChangeType } from "@/utils/changeIndex";
import type { ScoreStats } from "@/utils/scoreStats";

/** localStorage key that persists the open/closed state of the sidebar. */
const STORAGE_KEY = "difflizst:diff-summary:open";
/** Allowed values for the filter chips. */
const FILTERS = ["add", "remove", "change"] as const;
type Filter = (typeof FILTERS)[number];

/** Public handle returned by `wireDiffSummary` so the caller can re-render. */
export type DiffSummaryHandle = {
  /** Re-render the list against the latest change entries. */
  refresh(entries: ChangeEntry[]): void;
  /** Re-render the score statistics block. Pass null to clear a side. */
  refreshStats(
    left: { stats: ScoreStats; filename: string } | null,
    right: { stats: ScoreStats; filename: string } | null,
  ): void;
};

/** DOM nodes the wiring needs; pulled out so the caller doesn't query twice. */
type Refs = {
  aside: HTMLElement;
  toggle: HTMLButtonElement;
  body: HTMLElement;
  counts: HTMLElement;
  list: HTMLOListElement;
  chips: NodeListOf<HTMLButtonElement>;
};

function loadInitialOpen(): boolean {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  // Default to open. Anything other than the explicit string "0" keeps it open
  // so unknown legacy values don't accidentally hide the sidebar.
  return raw !== "0";
}

function persistOpen(open: boolean): void {
  window.localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
}

function applyOpenState(refs: Refs, open: boolean): void {
  refs.aside.classList.toggle("diff-summary--collapsed", !open);
  refs.toggle.setAttribute("aria-expanded", String(open));
  refs.body.hidden = !open;
}

/** Render the counts line e.g. "+5 added · -2 removed · ~7 changed". */
function renderCounts(entries: ChangeEntry[], el: HTMLElement): void {
  const { add, remove, change } = countByChangeType(entries);
  el.innerHTML =
    `<span class="diff-summary-count diff-summary-count--add">+${add}</span>` +
    `<span class="diff-summary-count diff-summary-count--remove">-${remove}</span>` +
    `<span class="diff-summary-count diff-summary-count--change">~${change}</span>`;
}

function renderList(
  entries: ChangeEntry[],
  active: Set<Filter>,
  list: HTMLOListElement,
  onFocus: (id: string) => void,
): void {
  list.innerHTML = "";
  if (entries.length === 0) {
    const empty = document.createElement("li");
    empty.className = "diff-summary-empty";
    empty.textContent = "No changes — scores are identical.";
    list.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const entry of entries) {
    if (!active.has(entry.diff.changeType as Filter)) continue;
    const li = document.createElement("li");
    li.className = `diff-summary-item diff-summary-item--${entry.diff.changeType}`;
    li.dataset.changeId = entry.id;
    li.innerHTML =
      `<button class="diff-summary-item-btn" type="button">` +
      `<span class="diff-summary-item-type" aria-hidden="true">${entry.diff.changeType[0].toUpperCase()}</span>` +
      `<span class="diff-summary-item-label">${escapeText(entry.diff.label)}</span>` +
      `</button>`;
    const btn = li.querySelector<HTMLButtonElement>(".diff-summary-item-btn");
    btn?.addEventListener("click", () => onFocus(entry.id));
    fragment.appendChild(li);
  }
  list.appendChild(fragment);
}

/** Plain-text escape for label content. */
function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── Score statistics rendering ────────────────────────────────────────────

function statsRow(term: string, def: string): string {
  return (
    `<div class="score-stats-row">` +
    `<dt class="score-stats-term">${escapeText(term)}</dt>` +
    `<dd class="score-stats-def">${escapeText(def)}</dd>` +
    `</div>`
  );
}

function renderStatsColumn(stats: ScoreStats): string {
  const rows: string[] = [
    statsRow("Measures", String(stats.measureCount)),
    statsRow("Notes", String(stats.noteCount)),
    statsRow("Rests", String(stats.restCount)),
    statsRow("Parts", String(stats.partCount)),
  ];

  if (stats.keySignatures.length > 0) {
    rows.push(statsRow("Keys", stats.keySignatures.join(", ")));
  }
  if (stats.timeSignatures.length > 0) {
    rows.push(statsRow("Time", stats.timeSignatures.join(", ")));
  }
  if (stats.tempoMarkings.length > 0) {
    rows.push(statsRow("Tempo", stats.tempoMarkings.join(", ")));
  }
  if (stats.workTitle) {
    rows.push(statsRow("Title", stats.workTitle));
  }
  if (stats.composer) {
    rows.push(statsRow("Composer", stats.composer));
  }

  return `<dl class="score-stats-dl">${rows.join("")}</dl>`;
}

function renderStatsBlock(
  left: { stats: ScoreStats; filename: string } | null,
  right: { stats: ScoreStats; filename: string } | null,
): string {
  if (!left && !right) {
    return `<p class="diff-summary-empty">Load a score to see statistics.</p>`;
  }

  const isTwoSided = left !== null && right !== null;

  if (!isTwoSided) {
    const side = (left ?? right)!;
    return (
      `<p class="score-stats-filename">${escapeText(side.filename)}</p>` +
      renderStatsColumn(side.stats)
    );
  }

  return (
    `<div class="score-stats-side-by-side">` +
    `<div class="score-stats-side">` +
    `<p class="score-stats-filename score-stats-filename--left">${escapeText(left.filename)}</p>` +
    renderStatsColumn(left.stats) +
    `</div>` +
    `<div class="score-stats-side">` +
    `<p class="score-stats-filename score-stats-filename--right">${escapeText(right.filename)}</p>` +
    renderStatsColumn(right.stats) +
    `</div>` +
    `</div>`
  );
}

/**
 * Wire the diff summary sidebar.
 *
 * @param aside    The `<aside id="diff-summary">` root element.
 * @param onFocus  Callback invoked with the {@link ChangeEntry.id} of a row
 *                 the user clicks. The host re-uses this to drive the same
 *                 focus animation as next/prev nav.
 */
export function wireDiffSummary(
  aside: HTMLElement,
  onFocus: (id: string) => void,
): DiffSummaryHandle {
  const refs: Refs = {
    aside,
    toggle: aside.querySelector<HTMLButtonElement>("#diff-summary-toggle")!,
    body: aside.querySelector<HTMLElement>("#diff-summary-body")!,
    counts: aside.querySelector<HTMLElement>("#diff-summary-counts")!,
    list: aside.querySelector<HTMLOListElement>("#diff-summary-list")!,
    chips: aside.querySelectorAll<HTMLButtonElement>(".diff-summary-chip"),
  };

  // ── Stats block (injected after the existing diff body) ─────────────────
  const statsDetails = document.createElement("details");
  statsDetails.className = "score-stats-details";
  statsDetails.open = false;
  statsDetails.innerHTML =
    `<summary class="score-stats-summary">Score statistics</summary>` +
    `<div id="diff-summary-stats" class="score-stats-body">` +
    `<p class="diff-summary-empty">Load a score to see statistics.</p>` +
    `</div>`;
  aside.appendChild(statsDetails);

  const statsBodyEl = statsDetails.querySelector<HTMLElement>("#diff-summary-stats")!;

  let lastEntries: ChangeEntry[] = [];
  const activeFilters = new Set<Filter>(FILTERS);

  // ── Collapse toggle (persisted) ─────────────────────────────────────────
  applyOpenState(refs, loadInitialOpen());
  refs.toggle.addEventListener("click", () => {
    const open = refs.toggle.getAttribute("aria-expanded") !== "true";
    applyOpenState(refs, open);
    persistOpen(open);
  });

  // ── Filter chips ────────────────────────────────────────────────────────
  refs.chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const f = chip.dataset.filter as Filter | undefined;
      if (!f) return;
      const next = !activeFilters.has(f);
      if (next) activeFilters.add(f);
      else activeFilters.delete(f);
      chip.setAttribute("aria-pressed", String(next));
      renderList(lastEntries, activeFilters, refs.list, onFocus);
    });
  });

  function refresh(entries: ChangeEntry[]): void {
    lastEntries = entries;
    renderCounts(entries, refs.counts);
    renderList(entries, activeFilters, refs.list, onFocus);
  }

  function refreshStats(
    left: { stats: ScoreStats; filename: string } | null,
    right: { stats: ScoreStats; filename: string } | null,
  ): void {
    const leftOrRight = left ?? right;
    const summaryText =
      left && right
        ? `Score statistics · ${left.filename} vs ${right.filename}`
        : leftOrRight
          ? `Score statistics · ${leftOrRight.filename}`
          : "Score statistics";

    const summaryEl = statsDetails.querySelector("summary");
    if (summaryEl) summaryEl.textContent = summaryText;

    statsBodyEl.innerHTML = renderStatsBlock(left, right);
  }

  return { refresh, refreshStats };
}
