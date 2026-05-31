/**
 * Diff summary sidebar wiring.
 *
 * Renders the flat change list into a clickable list, shows counts of
 * added/removed/changed entries, exposes filter chips for each type, and
 * persists its open/closed state across reloads.
 *
 * Kept as a plain wiring module (not a Web Component) because every input
 * — the flat change list, the focus callback, the counts — already lives
 * in main.ts and would otherwise have to be funneled through attributes or
 * a shared store for no readability benefit.
 */

import { type ChangeEntry, countByChangeType } from "@/utils/changeIndex";

/** localStorage key that persists the open/closed state of the sidebar. */
const STORAGE_KEY = "difflizst:diff-summary:open";
/** Allowed values for the filter chips. */
const FILTERS = ["add", "remove", "change"] as const;
type Filter = (typeof FILTERS)[number];

/** Public handle returned by `wireDiffSummary` so the caller can re-render. */
export type DiffSummaryHandle = {
  /** Re-render the list against the latest change entries. */
  refresh(entries: ChangeEntry[]): void;
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

  return { refresh };
}
