import { type VerovioOptions, toolkit as Toolkit } from "verovio";
import { setNotationSVGIDToIndexBase } from "@/utils/setNotationSVGIDToIndexBase";
import { getTotalPageCount } from "@/utils/getTotalPageCount";
import {
  diffXML,
  type XMLDiffResult,
  type ChildDiffKey,
} from "@/utils/diffXML";
import {
  applyDiffHighlights,
  buildMeasureIdMap,
  buildChildIdMap,
} from "@/utils/applyDiffHighlights";
import type { DiffSettingsValue } from "@/components/diffSettings";
import type { Pages } from "@/components/pages";

// ─── Types ─────────────────────────────────────────────────────────────────

/**
 * All mutable rendering state owned by main.ts and passed into these functions.
 * Using an interface so callers are explicit about what they're handing over.
 */
export interface NotationState {
  originalXML: string | null;
  xMLToCompare: string | null;
  toolkit: Toolkit | null;
  toolkit2: Toolkit | null;
  xmlDiff: XMLDiffResult | null;
  measureIdMap1: Map<string, number>;
  measureIdMap2: Map<string, number>;
  childIdMap1: Map<string, ChildDiffKey>;
  childIdMap2: Map<string, ChildDiffKey>;
}

// ─── Scale helpers ──────────────────────────────────────────────────────────

/**
 * Update a scale `<output>` element's displayed value.
 */
export function updateScaleOutput(
  output: HTMLOutputElement,
  scale: number,
): void {
  output.value = `${scale}%`;
  output.textContent = `${scale}%`;
}

/**
 * Re-render one score at a new scale.
 *
 * Calls `toolkit.setOptions({ scale })`, redoes layout for new page breaks,
 * and produces updated SVG. Pagination total is refreshed because scale
 * changes alter how many pages the score occupies.
 */
export function rescale(
  tk: Toolkit,
  pagination: Pages,
  container: HTMLDivElement,
  scale: number,
): void {
  tk.setOptions({ scale });
  tk.redoLayout();
  pagination.total = getTotalPageCount(tk);
  container.innerHTML = tk.renderToSVG(pagination.page);
  setNotationSVGIDToIndexBase(container);
}

// ─── Diff helpers ───────────────────────────────────────────────────────────

/**
 * Re-apply the current diff highlights to both containers.
 *
 * Called after every render that changes the SVG content (scale, page turn)
 * so overlays are repositioned over the freshly rendered elements.
 */
export function reapplyDiff(
  state: NotationState,
  containers: [HTMLDivElement, HTMLDivElement],
  showLineNumbers: boolean,
): void {
  if (!state.xmlDiff) return;
  applyDiffHighlights(
    containers[0],
    containers[1],
    state.xmlDiff,
    state.measureIdMap1,
    state.measureIdMap2,
    state.childIdMap1,
    state.childIdMap2,
    showLineNumbers,
  );
}

/**
 * (Re-)compute the diff with the given options and apply highlights.
 *
 * Mutates `state.xmlDiff` and returns the new value so main.ts can update
 * its own reference. Returns `null` if either score is not loaded.
 */
export function runDiff(
  state: NotationState,
  containers: [HTMLDivElement, HTMLDivElement],
  opts: DiffSettingsValue,
): XMLDiffResult | null {
  if (!state.originalXML || !state.xMLToCompare) return null;
  const result = diffXML(state.originalXML, state.xMLToCompare, opts);
  state.xmlDiff = result;
  reapplyDiff(state, containers, opts.showLineNumbers);
  return result;
}

// ─── Verovio rendering ──────────────────────────────────────────────────────

/**
 * Initial render of one score.
 *
 * Order of operations:
 *  1. `loadData`    — parse MusicXML; must precede other toolkit calls.
 *  2. `setOptions`  — apply rendering options (scale, breaks, etc.).
 *  3. `getPageCount`— accurate only after loadData + setOptions.
 *  4. `renderToSVG` — produce the SVG for the first page.
 */
export function renderNotation(
  xmlFile: string | null,
  pagination: Pages,
  tk: Toolkit | null,
  container: HTMLDivElement,
  scale: number,
): void {
  if (!tk || !xmlFile)
    return console.warn("renderNotation: missing toolkit or XML");

  const options: VerovioOptions = {
    adjustPageHeight: true,
    breaks: "auto",
    scale,
    systemMaxPerPage: 24,
  };

  tk.loadData(xmlFile);
  tk.setOptions(options);

  pagination.total = getTotalPageCount(tk);
  pagination.toolkit = tk;

  container.innerHTML = tk.renderToSVG(pagination.page);
  setNotationSVGIDToIndexBase(container);
}

/**
 * Swap out one score and refresh everything downstream.
 *
 * Mutates the relevant fields on `state` in-place (single source of truth
 * stays in main.ts — the object is passed by reference).
 *
 * @param which    1 = original/left, 2 = compare/right.
 * @param xml      Raw MusicXML string for the new score.
 * @param filename Display name for the Monaco file header.
 * @param state    Mutable app state owned by main.ts.
 * @param containers Tuple of [container1, container2].
 * @param pagination Tuple of [paginationEl, paginationEl2].
 * @param scaleInput The shared scale input to read the current scale from.
 * @param onModelUpdate Called with (side, xml) so main.ts can push value to Monaco models.
 * @param onFilenameUpdate Called with (side, filename) so main.ts can update header labels.
 * @param opts     Current diff settings.
 */
export function reloadScore(
  which: 1 | 2,
  xml: string,
  filename: string,
  state: NotationState,
  containers: [HTMLDivElement, HTMLDivElement],
  pagination: [Pages, Pages],
  scaleInput: HTMLInputElement,
  opts: DiffSettingsValue,
  onModelUpdate: (side: 1 | 2, xml: string) => void,
  onFilenameUpdate: (side: 1 | 2, filename: string) => void,
): void {
  const scale = Number(scaleInput.value);

  if (which === 1) {
    state.originalXML = xml;
    renderNotation(xml, pagination[0], state.toolkit, containers[0], scale);
    state.measureIdMap1 = buildMeasureIdMap(state.toolkit!);
    state.childIdMap1 = buildChildIdMap(state.toolkit!);
  } else {
    state.xMLToCompare = xml;
    renderNotation(xml, pagination[1], state.toolkit2, containers[1], scale);
    state.measureIdMap2 = buildMeasureIdMap(state.toolkit2!);
    state.childIdMap2 = buildChildIdMap(state.toolkit2!);
  }

  onModelUpdate(which, xml);
  onFilenameUpdate(which, filename);
  runDiff(state, containers, opts);
}
