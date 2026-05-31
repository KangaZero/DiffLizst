import type { toolkit as Toolkit } from "verovio";
import type { Pages } from "@/components/pages";
import type { NotationState } from "./notation-pipeline";

// ─── Types ─────────────────────────────────────────────────────────────────

interface JumpContext {
  state: NotationState;
  containers: readonly [HTMLDivElement, HTMLDivElement];
  paginations: readonly [Pages, Pages];
}

// ─── Measure lookup ─────────────────────────────────────────────────────────

/**
 * Invert a `Map<svgId, measureNumber>` into `Map<measureNumber, svgId>`.
 *
 * The source map is keyed by SVG id because that is what the diff-highlight
 * engine needs per rendered page. The jump engine needs the reverse direction
 * (measure number → id) to call `getPageWithElement`.
 */
function invertMeasureMap(map: Map<string, number>): Map<number, string> {
  const inv = new Map<number, string>();
  for (const [id, num] of map) {
    if (!inv.has(num)) inv.set(num, id);
  }
  return inv;
}

/**
 * Find which page contains a given measure number and return the SVG id that
 * Verovio uses to locate it.
 *
 * Returns `null` when the measure number is absent from the toolkit's full id
 * map, or when `getPageWithElement` returns 0 (element not found).
 */
function resolveTarget(
  measureNum: number,
  map: Map<string, number>,
  tk: Toolkit,
): { svgId: string; page: number } | null {
  const inv = invertMeasureMap(map);
  const svgId = inv.get(measureNum);
  if (!svgId) return null;
  const page = tk.getPageWithElement(svgId);
  if (!page || page < 1) return null;
  return { svgId, page };
}

// ─── Scroll helper ──────────────────────────────────────────────────────────

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

/**
 * After a page is rendered, find the `<g class="measure">` SVG element whose
 * id starts with the given prefix and scroll it into view.
 *
 * Verovio SVG ids follow the pattern `<svgId>-svg<N>` for notes inside a
 * measure, but the measure `<g>` itself carries the raw MEI xml:id as its id.
 * We match on prefix equality against the first element whose id equals `svgId`.
 */
function scrollToMeasure(container: HTMLDivElement, svgId: string): void {
  const el = container.querySelector<SVGGElement>(`g.measure[id="${CSS.escape(svgId)}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: scrollBehavior(), block: "center", inline: "center" });
}

// ─── Page flip + scroll ─────────────────────────────────────────────────────

/**
 * Navigate one notation pane to the given page and scroll to the measure.
 *
 * Setting `pagination.page` triggers Verovio re-render and dispatches the
 * `page-change` event (which `main.ts` handles to reapply diff highlights).
 * We wait one `requestAnimationFrame` so the SVG DOM is fully updated before
 * attempting to scroll.
 */
function jumpOnePaneTo(
  measureNum: number,
  map: Map<string, number>,
  tk: Toolkit,
  pagination: Pages,
  container: HTMLDivElement,
): void {
  const target = resolveTarget(measureNum, map, tk);
  if (!target) return;

  if (pagination.page !== target.page) {
    pagination.page = target.page;
  }

  requestAnimationFrame(() => scrollToMeasure(container, target.svgId));
}

// ─── Error toast ────────────────────────────────────────────────────────────

let toastEl: HTMLDivElement | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function getToast(): HTMLDivElement {
  if (toastEl) return toastEl;
  toastEl = document.createElement("div");
  toastEl.id = "measure-jump-toast";
  toastEl.setAttribute("role", "alert");
  toastEl.setAttribute("aria-live", "assertive");
  toastEl.setAttribute("aria-atomic", "true");
  document.body.appendChild(toastEl);
  return toastEl;
}

function showError(input: HTMLInputElement, message: string): void {
  input.classList.add("measure-jump-input--error");
  const toast = getToast();
  toast.textContent = message;
  toast.classList.add("measure-jump-toast--visible");

  if (toastTimer !== null) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    input.classList.remove("measure-jump-input--error");
    toast.classList.remove("measure-jump-toast--visible");
    toastTimer = null;
  }, 3000);
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Handle a measure-jump submit from the toolbar input.
 *
 * Looks up the requested measure number in both score id maps. If found in
 * either, page-flips (if needed) and scrolls both panes. If not found in
 * either map, flashes the input border red and shows an accessible error toast.
 *
 * An empty input is a no-op (no error surfaced — matches spec §3 case 3).
 */
export function jumpToMeasure(input: HTMLInputElement, ctx: JumpContext): void {
  const raw = input.value.trim();
  if (raw === "") return;

  const num = Number(raw);
  if (!Number.isInteger(num) || num < 1) {
    showError(input, `Measure number must be a positive integer`);
    return;
  }

  const { state, containers, paginations } = ctx;
  const tk1 = state.toolkit;
  const tk2 = state.toolkit2;
  const foundIn1 = tk1 ? resolveTarget(num, state.measureIdMap1, tk1) : null;
  const foundIn2 = tk2 ? resolveTarget(num, state.measureIdMap2, tk2) : null;

  if (!foundIn1 && !foundIn2) {
    showError(input, `Measure ${num} not found in either score`);
    return;
  }

  if (foundIn1 && tk1) {
    jumpOnePaneTo(num, state.measureIdMap1, tk1, paginations[0], containers[0]);
  }
  if (foundIn2 && tk2) {
    jumpOnePaneTo(num, state.measureIdMap2, tk2, paginations[1], containers[1]);
  }
}

/**
 * Wire the measure-jump input: listen for Enter keydown and call `jumpToMeasure`.
 *
 * Returns a dispose function that removes the listener (useful if the toolbar
 * is ever torn down).
 */
export function wireMeasureJump(input: HTMLInputElement, ctx: JumpContext): () => void {
  function onKeydown(e: KeyboardEvent): void {
    if (e.key === "Enter") {
      e.preventDefault();
      jumpToMeasure(input, ctx);
    }
  }
  input.addEventListener("keydown", onKeydown);
  return () => input.removeEventListener("keydown", onKeydown);
}
