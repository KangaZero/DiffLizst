import "./style.css";
import "./components/notation/note";
import "./components/themeToggle";
import "./components/pages";
import "./components/diffSettings";
import "./components/scoreLoader";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import type { toolkit as Toolkit } from "verovio";
import * as verovio from "verovio";
import { renderGitDiffPage, wireGitDiffSplitToggle } from "@/bootstrap/git-diff-page";
import { APP_HTML } from "@/bootstrap/html-shell";
import { getMonacoDiffEditor, renderCodeDiffPage, wireEditToggle } from "@/bootstrap/monaco-page";
import {
  type NotationState,
  reapplyDiff,
  reloadScore,
  renderNotation,
  rescale,
  runDiff,
  updateScaleOutput,
} from "@/bootstrap/notation-pipeline";
import { buildChildIdMap, buildMeasureIdMap } from "@/utils/applyDiffHighlights";
import type { ChildDiffKey, ElementDiff, XMLDiffResult } from "@/utils/diffXML";
import { setNotationSVGIDToIndexBase } from "@/utils/setNotationSVGIDToIndexBase";
import { DEFAULT_SETTINGS, type DiffSettingsValue } from "./components/diffSettings";
import type { Pages } from "./components/pages";
import type {
  Composer,
  MXML,
  ScoreLoadDetail,
  ScoreLoader,
  ScoreLoaderSample,
} from "./components/scoreLoader";

self.MonacoEnvironment = {
  getWorker(_id: string, _label: string): Worker {
    return new EditorWorker();
  },
};

// ─── Score sources ─────────────────────────────────────────────────────────
const _scoreModules = import.meta.glob<string>("./scores/**/*.xml", {
  query: "?raw",
  import: "default",
  eager: true,
});

const SAMPLE_SCORES: ScoreLoaderSample[] = Object.entries(_scoreModules).map(([path, xml]) => {
  const segments = path.split("/");
  const composer = segments[segments.length - 2] as Composer;
  const label = segments[segments.length - 1].replace(/\.xml$/i, "");
  return {
    id: `${composer}-${label}` as `${Composer}-${string}`,
    composer,
    label,
    xml: xml as MXML,
  };
});

// ─── DOM bootstrap ────────────────────────────────────────────────────────

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root element not found");

app.innerHTML = APP_HTML;

// ─── Element queries ───────────────────────────────────────────────────────

const notationContainer = document.querySelector<HTMLDivElement>("#XML-notation")!;
const notationContainer2 = document.querySelector<HTMLDivElement>("#XML-notation-compare")!;
const notationPanel = document.querySelector<HTMLDivElement>("#docs .notation-panel")!;
const notationPanel2 = document.querySelector<HTMLDivElement>("#social .notation-panel")!;
const sharedScaleInput = document.querySelector<HTMLInputElement>("#notation-scale")!;
const sharedScaleOutput = document.querySelector<HTMLOutputElement>("#notation-scale-value")!;
const scale1Input = document.querySelector<HTMLInputElement>("#scale-1")!;
const scale1Output = document.querySelector<HTMLOutputElement>("#scale-1-value")!;
const scale2Input = document.querySelector<HTMLInputElement>("#scale-2")!;
const scale2Output = document.querySelector<HTMLOutputElement>("#scale-2-value")!;
const diffSettingsEl = document.querySelector<HTMLElement>("diff-settings")!;
const viewToggleBtn = document.querySelector<HTMLButtonElement>("#view-toggle")!;
const gitDiffToggleBtn = document.querySelector<HTMLButtonElement>("#git-diff-toggle")!;
const diffPageEl = document.querySelector<HTMLElement>("#diff-page")!;
const gitDiffPageEl = document.querySelector<HTMLElement>("#git-diff-page")!;
const gitDiffHunksEl = document.querySelector<HTMLElement>("#git-diff-hunks")!;
const gitDiffSplitToggleBtn = document.querySelector<HTMLButtonElement>("#git-diff-split-toggle")!;
const diffEditorContainer = document.querySelector<HTMLElement>("#diff-editor-container")!;
const diffEditToggleBtn = document.querySelector<HTMLButtonElement>("#diff-edit-toggle")!;

if (
  !notationContainer ||
  !notationContainer2 ||
  !notationPanel ||
  !notationPanel2 ||
  !sharedScaleInput ||
  !sharedScaleOutput ||
  !scale1Input ||
  !scale1Output ||
  !scale2Input ||
  !scale2Output ||
  !diffSettingsEl ||
  !viewToggleBtn ||
  !gitDiffToggleBtn ||
  !diffPageEl ||
  !gitDiffPageEl ||
  !gitDiffHunksEl ||
  !gitDiffSplitToggleBtn ||
  !diffEditorContainer ||
  !diffEditToggleBtn
) {
  throw new Error("Required app elements not found in DOM");
}

// ─── Pagination components ─────────────────────────────────────────────────

const paginationEl: Pages = document.createElement("page-pagination");
const paginationEl2: Pages = document.createElement("page-pagination");
paginationEl.notationContainer = notationContainer;
paginationEl2.notationContainer = notationContainer2;
notationPanel.prepend(paginationEl);
notationPanel2.prepend(paginationEl2);

// ─── Score loader components ────────────────────────────────────────────────

const scoreLoaderEl = document.querySelector<ScoreLoader>("#score-loader-1")!;
const scoreLoaderEl2 = document.querySelector<ScoreLoader>("#score-loader-2")!;
scoreLoaderEl.samples = SAMPLE_SCORES;
scoreLoaderEl2.samples = SAMPLE_SCORES;

// ─── Mutable rendering state — SINGLE SOURCE OF TRUTH ─────────────────────

let currentSettings: DiffSettingsValue = { ...DEFAULT_SETTINGS };

const state: NotationState = {
  originalXML: null,
  xMLToCompare: null,
  toolkit: null as Toolkit | null,
  toolkit2: null as Toolkit | null,
  xmlDiff: null as XMLDiffResult | null,
  measureIdMap1: new Map<string, number>(),
  measureIdMap2: new Map<string, number>(),
  childIdMap1: new Map<string, ChildDiffKey>(),
  childIdMap2: new Map<string, ChildDiffKey>(),
};

const containers: [HTMLDivElement, HTMLDivElement] = [notationContainer, notationContainer2];

// Guard against auto-switching when user has a saved preference.
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (window.localStorage.getItem("theme-preference")) return;
});

// ─── Monaco callbacks ──────────────────────────────────────────────────────

function rerenderScore2Background(xml: string): void {
  state.xMLToCompare = xml;
  if (!state.toolkit2) return;
  try {
    const scale = Number(scale2Input.value);
    renderNotation(xml, paginationEl2, state.toolkit2, notationContainer2, scale);
    state.measureIdMap2 = buildMeasureIdMap(state.toolkit2);
    state.childIdMap2 = buildChildIdMap(state.toolkit2);
    reapplyDiff(state, containers, currentSettings.showLineNumbers);
  } catch {
    // XML is temporarily invalid while editing — skip silently
  }
}

const monacoCallbacks = {
  runDiff: () => runDiff(state, containers, currentSettings),
  rerenderScore2: rerenderScore2Background,
};

// ─── View toggle ───────────────────────────────────────────────────────────

const notationSections = [
  document.querySelector<HTMLElement>(".shared-controls")!,
  document.querySelector<HTMLElement>("#next-steps")!,
];

type View = "notation" | "monaco" | "gitdiff";
let activeView: View = "notation";

function switchView(target: View): void {
  activeView = activeView === target ? "notation" : target;
  const isMonaco = activeView === "monaco";
  const isGitDiff = activeView === "gitdiff";
  const isNotation = activeView === "notation";

  viewToggleBtn.setAttribute("aria-pressed", String(isMonaco));
  gitDiffToggleBtn.setAttribute("aria-pressed", String(isGitDiff));
  notationSections.forEach((el) => {
    if (el) el.style.display = isNotation ? "" : "none";
  });

  if (isMonaco) {
    diffPageEl.classList.add("visible");
    renderCodeDiffPage(
      state.originalXML,
      state.xMLToCompare,
      diffEditorContainer,
      currentSettings,
      monacoCallbacks,
    );
    requestAnimationFrame(() => getMonacoDiffEditor()?.layout());
  } else {
    diffPageEl.classList.remove("visible");
  }

  if (isGitDiff) {
    gitDiffPageEl.classList.add("visible");
    renderGitDiffPage(state.xmlDiff, gitDiffHunksEl, currentSettings);
  } else {
    gitDiffPageEl.classList.remove("visible");
  }
}

viewToggleBtn.addEventListener("click", () => switchView("monaco"));
gitDiffToggleBtn.addEventListener("click", () => switchView("gitdiff"));

// ─── Monaco navigation from diff overlays ─────────────────────────────────

function labelToSearchTerm(label: string): string {
  const m = label.match(/^measure (\d+)$/);
  return m ? `number="${m[1]}"` : "<credit>";
}

function navigateMonacoToDiff(diff: ElementDiff): void {
  const editor = getMonacoDiffEditor();
  if (!editor) return;
  const pane =
    diff.changeType === "remove" ? editor.getOriginalEditor() : editor.getModifiedEditor();
  const model = pane.getModel();
  if (!model) return;
  const matches = model.findMatches(labelToSearchTerm(diff.label), true, false, false, null, false);
  if (matches.length === 0) return;
  const line = matches[0].range.startLineNumber;
  pane.revealLineInCenter(line);
  pane.setPosition({ lineNumber: line, column: 1 });
  pane.focus();
}

[notationContainer, notationContainer2].forEach((container) => {
  container.addEventListener("diff-navigate", (e) => {
    const diff = (e as CustomEvent<ElementDiff>).detail;
    switchView("monaco");
    requestAnimationFrame(() => navigateMonacoToDiff(diff));
  });
});

// ─── Score loader helpers (shared callback factories) ─────────────────────

function makeModelUpdateCb(): (side: 1 | 2, xml: string) => void {
  return (side, value) => {
    const monacoEditor = getMonacoDiffEditor();
    if (side === 1) monacoEditor?.getModel()?.original.setValue(value);
    else monacoEditor?.getModel()?.modified.setValue(value);
  };
}

function makeFilenameCb(): (side: 1 | 2, name: string) => void {
  return (side, name) => {
    const cls = side === 1 ? ".diff-file-old" : ".diff-file-new";
    document.querySelectorAll<HTMLElement>(cls).forEach((el) => {
      el.textContent = name;
    });
  };
}

function wireScoreLoader(el: ScoreLoader, which: 1 | 2): void {
  el.addEventListener("score-load", (e) => {
    const { xml, filename } = (e as CustomEvent<ScoreLoadDetail>).detail;
    reloadScore(
      which,
      xml,
      filename,
      state,
      containers,
      [paginationEl, paginationEl2],
      sharedScaleInput,
      currentSettings,
      makeModelUpdateCb(),
      makeFilenameCb(),
    );
    if (activeView === "gitdiff") renderGitDiffPage(state.xmlDiff, gitDiffHunksEl, currentSettings);
  });
}

wireScoreLoader(scoreLoaderEl, 1);
wireScoreLoader(scoreLoaderEl2, 2);

// ─── Button wiring ─────────────────────────────────────────────────────────

wireEditToggle(diffEditToggleBtn);

wireGitDiffSplitToggle(
  gitDiffSplitToggleBtn,
  diffSettingsEl,
  () => currentSettings,
  (s) => {
    currentSettings = s;
  },
  () => renderGitDiffPage(state.xmlDiff, gitDiffHunksEl, currentSettings),
);

// ─── Scale event listeners ─────────────────────────────────────────────────

sharedScaleInput.addEventListener("input", () => {
  const scale = Number(sharedScaleInput.value);
  updateScaleOutput(sharedScaleOutput, scale);
  scale1Input.value = String(scale);
  scale2Input.value = String(scale);
  updateScaleOutput(scale1Output, scale);
  updateScaleOutput(scale2Output, scale);
  if (!state.toolkit || !state.toolkit2) return;
  rescale(state.toolkit, paginationEl, notationContainer, scale);
  rescale(state.toolkit2, paginationEl2, notationContainer2, scale);
  reapplyDiff(state, containers, currentSettings.showLineNumbers);
});

scale1Input.addEventListener("input", () => {
  const scale = Number(scale1Input.value);
  updateScaleOutput(scale1Output, scale);
  if (!state.toolkit) return;
  rescale(state.toolkit, paginationEl, notationContainer, scale);
  reapplyDiff(state, containers, currentSettings.showLineNumbers);
});

scale2Input.addEventListener("input", () => {
  const scale = Number(scale2Input.value);
  updateScaleOutput(scale2Output, scale);
  if (!state.toolkit2) return;
  rescale(state.toolkit2, paginationEl2, notationContainer2, scale);
  reapplyDiff(state, containers, currentSettings.showLineNumbers);
});

// ─── Diff settings listener ────────────────────────────────────────────────

diffSettingsEl.addEventListener("settings-change", (e) => {
  currentSettings = (e as CustomEvent<DiffSettingsValue>).detail;
  const isSplit = currentSettings.gitDiffOrientation === "split";
  gitDiffSplitToggleBtn.setAttribute("aria-pressed", String(isSplit));
  gitDiffSplitToggleBtn.textContent = isSplit ? "Unified" : "Split";
  runDiff(state, containers, currentSettings);
  if (activeView === "monaco")
    renderCodeDiffPage(
      state.originalXML,
      state.xMLToCompare,
      diffEditorContainer,
      currentSettings,
      monacoCallbacks,
    );
});

// ─── Page-change listeners ─────────────────────────────────────────────────

paginationEl.addEventListener("page-change", () => {
  setNotationSVGIDToIndexBase(notationContainer);
  reapplyDiff(state, containers, currentSettings.showLineNumbers);
});

paginationEl2.addEventListener("page-change", () => {
  setNotationSVGIDToIndexBase(notationContainer2);
  reapplyDiff(state, containers, currentSettings.showLineNumbers);
});

// ─── Verovio initialisation ────────────────────────────────────────────────

verovio.module.onRuntimeInitialized = async () => {
  state.toolkit = new verovio.toolkit();
  state.toolkit2 = new verovio.toolkit();

  try {
    state.originalXML = SAMPLE_SCORES[2]?.xml ?? null;
    state.xMLToCompare = SAMPLE_SCORES[0]?.xml ?? null;

    const scale = Number(sharedScaleInput.value);
    updateScaleOutput(sharedScaleOutput, scale);
    updateScaleOutput(scale1Output, scale);
    updateScaleOutput(scale2Output, scale);

    renderNotation(state.originalXML, paginationEl, state.toolkit, notationContainer, scale);
    renderNotation(state.xMLToCompare, paginationEl2, state.toolkit2, notationContainer2, scale);

    state.measureIdMap1 = buildMeasureIdMap(state.toolkit);
    state.measureIdMap2 = buildMeasureIdMap(state.toolkit2);
    state.childIdMap1 = buildChildIdMap(state.toolkit);
    state.childIdMap2 = buildChildIdMap(state.toolkit2);

    runDiff(state, containers, currentSettings);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    notationContainer.textContent = `Unable to load score: ${message}`;
  }
};
