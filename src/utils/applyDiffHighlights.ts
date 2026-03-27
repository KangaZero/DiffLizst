/**
 * Overlay-based diff highlighting for Verovio SVG output.
 *
 * Strategy: rather than modifying the SVG directly (which would be overwritten
 * on every re-render), this module injects absolutely-positioned `<div>`
 * overlays on top of the `.notation-stage` containers.  Each overlay covers
 * one changed SVG element and shows a raw diff tooltip on hover.
 *
 * The tooltip is a single `<div id="diff-tooltip">` appended to `<body>` with
 * `position: fixed`, which avoids being clipped by the stage's `overflow-x: auto`.
 * JS positions it near the cursor; CSS handles all visual styling.
 *
 * ## Page-awareness
 * Verovio only renders the measures belonging to the requested page, so
 * `querySelectorAll('g.measure')` returns a sub-set of the full score. To
 * avoid highlighting the wrong measures (e.g. measure 1 appearing on page 2
 * because positional index 0 was used), each `g.measure` is matched by its
 * Verovio-assigned SVG `id`, which is derived from the MEI `xml:id`. The
 * caller must supply a `Map<svgId, measureNumber>` built once from the
 * toolkit's MEI output ({@link buildMeasureIdMap}).
 *
 * Call {@link applyDiffHighlights} after every re-render (scale change, page
 * turn) since the SVG innerHTML is replaced each time and previously injected
 * overlays are removed.
 */

import type { ElementDiff, XMLDiffResult } from "./diffXML";

/** Singleton tooltip element shared across all overlays. */
let tooltipEl: HTMLDivElement | null = null;

/**
 * Return the singleton `#diff-tooltip` element, creating and appending it to
 * `<body>` on first call.
 *
 * Using a single shared tooltip (rather than one per overlay) keeps the DOM
 * lean and avoids z-index / stacking issues.
 */
function getTooltip(): HTMLDivElement {
  if (tooltipEl) return tooltipEl;
  tooltipEl = document.createElement("div");
  tooltipEl.id = "diff-tooltip";
  tooltipEl.setAttribute("aria-hidden", "true");
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}

/**
 * Serialise an {@link ElementDiff} into the inner HTML for the tooltip.
 *
 * Output format mirrors a raw `git diff` hunk:
 * ```
 * @@ measure 5 @@
 * 1    - <beats>4</beats>
 *   1  + <beats>3</beats>
 * ```
 *
 * When `showLineNumbers` is `true`, two narrow gutter columns are prepended:
 * the old-file line number (left) and new-file line number (right), mirroring
 * GitHub's unified diff view.
 *
 * All `<` and `>` characters in line content are HTML-escaped so that the
 * XML is rendered as text rather than parsed as markup inside the tooltip.
 *
 * @param diff            The element diff to render.
 * @param showLineNumbers Whether to prepend old/new line number columns.
 */
function buildTooltipHTML(diff: ElementDiff): string {
  const header = `<span class="diff-tooltip-header">@@ ${diff.label} @@</span>`;
  const body = diff.lines
    .map((l) => {
      const prefix = l.type === "add" ? "+" : l.type === "remove" ? "-" : " ";
      const cls = `diff-line-${l.type}`;
      const escaped = l.content
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return `<span class="${cls}">${prefix}${escaped}</span>`;
    })
    .join("");
  return `${header}<code class="diff-tooltip-body">${body}</code>`;
}

/**
 * Position the tooltip near the mouse cursor while keeping it fully within
 * the viewport.
 *
 * Preferred position: 14px to the right and below the cursor.
 * If that would clip the right or bottom edge, the tooltip is flipped to the
 * opposite side.
 *
 * @param tooltip The `#diff-tooltip` element (already visible in the DOM).
 * @param e       The `MouseEvent` that triggered the repositioning.
 */
function positionTooltip(tooltip: HTMLDivElement, e: MouseEvent): void {
  const gap = 14;
  const tipW = tooltip.offsetWidth || 320;
  const tipH = tooltip.offsetHeight || 200;
  let x = e.clientX + gap;
  let y = e.clientY + gap;
  if (x + tipW > window.innerWidth) x = e.clientX - tipW - gap;
  if (y + tipH > window.innerHeight) y = e.clientY - tipH - gap;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

/**
 * Create a single diff overlay `<div>` positioned over `targetEl` inside
 * `container`, then wire up the hover tooltip behaviour.
 *
 * The overlay is positioned using `getBoundingClientRect()` converted to
 * container-relative coordinates, accounting for any scroll offset of the
 * container.
 *
 * @param targetEl        The SVG element to cover (a `g.measure` or `text` node).
 * @param container       The `.notation-stage` wrapping the rendered SVG.
 * @param diff            Pre-computed diff data for this element.
 * @param showLineNumbers Whether to render line number columns in the tooltip.
 */
function createOverlay(
  targetEl: Element,
  container: HTMLElement,
  diff: ElementDiff,
): HTMLDivElement {
  const tooltip = getTooltip();
  const html = buildTooltipHTML(diff);

  const overlay = document.createElement("div");
  overlay.className = `diff-overlay diff-overlay--${diff.changeType}`;

  // Convert viewport-relative rect to container-relative coordinates,
  // then add scroll offset so overlays stay correct after scrolling.
  const containerRect = container.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();
  overlay.style.left = `${targetRect.left - containerRect.left + container.scrollLeft}px`;
  overlay.style.top = `${targetRect.top - containerRect.top + container.scrollTop}px`;
  overlay.style.width = `${targetRect.width}px`;
  overlay.style.height = `${targetRect.height}px`;

  // Show / follow / hide tooltip on mouse events
  overlay.addEventListener("mouseenter", (e) => {
    tooltip.innerHTML = html;
    tooltip.classList.add("diff-tooltip--visible");
    positionTooltip(tooltip, e);
  });
  overlay.addEventListener("mousemove", (e) => positionTooltip(tooltip, e));
  overlay.addEventListener("mouseleave", () => {
    tooltip.classList.remove("diff-tooltip--visible");
  });

  return overlay;
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Build a map from Verovio SVG element id → MusicXML measure number by
 * parsing the MEI document that the toolkit internally holds.
 *
 * Verovio preserves the MEI `xml:id` of each element as the `id` attribute on
 * its corresponding SVG node. After converting a MusicXML file it assigns
 * `xml:id` values to all measures. The MEI `n` attribute holds the measure
 * number that matches the MusicXML `number` attribute used as the key in
 * {@link XMLDiffResult.measures}.
 *
 * Call this once per toolkit after `toolkit.loadData()` — the map is stable
 * for the lifetime of that loaded file and can be reused across all page
 * renders.
 *
 * @param toolkit An initialised Verovio toolkit with data already loaded.
 *
 * @example
 * ```ts
 * toolkit.loadData(xmlString);
 * const idMap = buildMeasureIdMap(toolkit);
 * // reuse on every page render:
 * applyDiffHighlights(c1, c2, diff, idMap1, idMap2);
 * ```
 */
export function buildMeasureIdMap(
  toolkit: { getMEI(opts?: { pageNo?: number; scoreBased?: boolean }): string },
): Map<string, number> {
  const map = new Map<string, number>();
  try {
    // pageNo: 0 → full document; scoreBased: true → clean element order
    const mei = toolkit.getMEI({ pageNo: 0, scoreBased: true });
    const doc = new DOMParser().parseFromString(mei, "application/xml");
    doc.querySelectorAll("measure").forEach((m, idx) => {
      const id = m.getAttribute("xml:id");
      // MEI 'n' = measure number; fall back to 1-based document index
      const n = parseInt(m.getAttribute("n") ?? String(idx + 1), 10);
      if (id) map.set(id, n);
    });
  } catch (err) {
    console.warn("[buildMeasureIdMap] Could not parse MEI:", err);
  }
  return map;
}

/**
 * Apply diff highlight overlays to both notation containers for the current
 * rendered page.
 *
 * For each changed element in `diff`:
 *
 * - **Measures** — Each `<g class="measure">` in the rendered SVG is resolved
 *   to a MusicXML measure number via `measureIdToNum` (its Verovio SVG `id`
 *   as key). Only measures present in the current page's SVG are highlighted,
 *   making this fully page-aware: no stale overlays from other pages.
 *
 * - **Credits** (page headers) — Matched against `g.pgHead text` elements by
 *   document-order index. Credits only appear on page 1; on other pages the
 *   pgHead query returns nothing and this block is a no-op.
 *
 * The function is idempotent: it removes all existing `.diff-overlay` children
 * before adding new ones, so it is safe to call on every re-render.
 *
 * @param container1      `.notation-stage` for the old (left) score.
 * @param container2      `.notation-stage` for the new (right) score.
 * @param diff            Output of {@link diffXML}.
 * @param measureIdToNum1 SVG id → measure number for score 1 (from {@link buildMeasureIdMap}).
 * @param measureIdToNum2 SVG id → measure number for score 2 (from {@link buildMeasureIdMap}).
 */
export function applyDiffHighlights(
  container1: HTMLElement,
  container2: HTMLElement,
  diff: XMLDiffResult,
  measureIdToNum1: Map<string, number>,
  measureIdToNum2: Map<string, number>,
): void {
  // Remove stale overlays from the previous render
  [container1, container2].forEach((c) =>
    c.querySelectorAll(".diff-overlay").forEach((el) => el.remove()),
  );

  // ── Measures ──────────────────────────────────────────────────────────
  // Iterate only the g.measure elements present in the current page's SVG.
  // Each is resolved to its measure number via the id map — this correctly
  // handles any page, not just page 1.

  container1.querySelectorAll<SVGGElement>("g.measure").forEach((el) => {
    const id = el.getAttribute("id") ?? "";
    const num = measureIdToNum1.get(id);
    if (num === undefined) return;
    const d = diff.measures.get(num);
    if (!d || d.changeType === "add") return; // 'add' only shown on right side
    container1.appendChild(createOverlay(el, container1, d));
  });

  container2.querySelectorAll<SVGGElement>("g.measure").forEach((el) => {
    const id = el.getAttribute("id") ?? "";
    const num = measureIdToNum2.get(id);
    if (num === undefined) return;
    const d = diff.measures.get(num);
    if (!d || d.changeType === "remove") return; // 'remove' only shown on left side
    container2.appendChild(createOverlay(el, container2, d));
  });

  // ── Credits (page header text) ─────────────────────────────────────────
  // Verovio renders <credit> content as <text> elements inside g.pgHead.
  // Only present on page 1 — on other pages querySelector returns null and
  // texts arrays are empty, making the loop below a safe no-op.
  const pgHead1 = container1.querySelector("g.pgHead");
  const pgHead2 = container2.querySelector("g.pgHead");
  const texts1 = pgHead1
    ? Array.from(pgHead1.querySelectorAll<SVGTextElement>("text"))
    : [];
  const texts2 = pgHead2
    ? Array.from(pgHead2.querySelectorAll<SVGTextElement>("text"))
    : [];

  for (const [idx, d] of diff.credits.entries()) {
    const t1 = texts1[idx];
    const t2 = texts2[idx];
    if (t1 && (d.changeType === "change" || d.changeType === "remove")) {
      container1.appendChild(createOverlay(t1, container1, d));
    }
    if (t2 && (d.changeType === "change" || d.changeType === "add")) {
      container2.appendChild(createOverlay(t2, container2, d));
    }
  }
}
