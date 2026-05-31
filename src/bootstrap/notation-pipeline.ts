import type { toolkit as Toolkit, VerovioOptions } from "verovio";
import type { DiffSettingsValue } from "@/components/diffSettings";
import type { Pages } from "@/components/pages";
import {
  applyDiffHighlights,
  buildChildIdMap,
  buildMeasureIdMap,
} from "@/utils/applyDiffHighlights";
import { type ChildDiffKey, diffXML, type XMLDiffResult } from "@/utils/diffXML";
import { getTotalPageCount } from "@/utils/getTotalPageCount";
import { setNotationSVGIDToIndexBase } from "@/utils/setNotationSVGIDToIndexBase";

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
export function updateScaleOutput(output: HTMLOutputElement, scale: number): void {
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
  if (!tk || !xmlFile) {
    console.warn("renderNotation: missing toolkit or XML");
    return;
  }

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
 * Swap the two loaded scores in-place and re-render both notation panes.
 *
 * Exchanges all paired state fields (XML, toolkit, id maps), re-renders each
 * container with the now-swapped toolkit, rebuilds the id maps, and runs a
 * fresh diff so overlays reflect the reversed change direction.
 *
 * @param state        Mutable app state owned by main.ts.
 * @param containers   Tuple of [container1, container2].
 * @param pagination   Tuple of [paginationEl, paginationEl2].
 * @param scaleInput   Shared scale input to read the current scale from.
 * @param opts         Current diff settings.
 * @param onModelUpdate Called with (side, xml) so the Monaco models stay in sync.
 * @param onFilenameUpdate Called with (side, filename) to update file header labels.
 * @param filename1    Display name for the current left score (becomes right after swap).
 * @param filename2    Display name for the current right score (becomes left after swap).
 */
export function swapScores(
  state: NotationState,
  containers: [HTMLDivElement, HTMLDivElement],
  pagination: [Pages, Pages],
  scaleInput: HTMLInputElement,
  opts: DiffSettingsValue,
  onModelUpdate: (side: 1 | 2, xml: string) => void,
  onFilenameUpdate: (side: 1 | 2, filename: string) => void,
  filename1: string,
  filename2: string,
): void {
  const scale = Number(scaleInput.value);

  // Swap XML strings.
  const tmpXML = state.originalXML;
  state.originalXML = state.xMLToCompare;
  state.xMLToCompare = tmpXML;

  // Swap toolkits.
  const tmpToolkit = state.toolkit;
  state.toolkit = state.toolkit2;
  state.toolkit2 = tmpToolkit;

  // Swap id maps.
  const tmpMeasureMap = state.measureIdMap1;
  state.measureIdMap1 = state.measureIdMap2;
  state.measureIdMap2 = tmpMeasureMap;

  const tmpChildMap = state.childIdMap1;
  state.childIdMap1 = state.childIdMap2;
  state.childIdMap2 = tmpChildMap;

  // Re-render both panes with the now-swapped data.
  renderNotation(state.originalXML, pagination[0], state.toolkit, containers[0], scale);
  renderNotation(state.xMLToCompare, pagination[1], state.toolkit2, containers[1], scale);

  // Rebuild id maps from the freshly rendered SVGs.
  if (state.toolkit) {
    state.measureIdMap1 = buildMeasureIdMap(state.toolkit);
    state.childIdMap1 = buildChildIdMap(state.toolkit);
  }
  if (state.toolkit2) {
    state.measureIdMap2 = buildMeasureIdMap(state.toolkit2);
    state.childIdMap2 = buildChildIdMap(state.toolkit2);
  }

  // Push swapped XML into Monaco models.
  if (state.originalXML) onModelUpdate(1, state.originalXML);
  if (state.xMLToCompare) onModelUpdate(2, state.xMLToCompare);

  // Update filename headers: each side gets the other's name.
  onFilenameUpdate(1, filename2);
  onFilenameUpdate(2, filename1);

  // Re-run diff so overlays reflect the reversed change direction.
  runDiff(state, containers, opts);
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
