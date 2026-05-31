import "./style.css";
import "./components/notation/note";
import "./components/themeToggle";
import "./components/pages";
import "./components/diffSettings";
import "./components/scoreLoader";
import type { toolkit as Toolkit } from "verovio";
import * as verovio from "verovio";
import { renderGitDiffPage, wireGitDiffSplitToggle } from "@/bootstrap/git-diff-page";
import { wireOverlayToMonaco } from "@/bootstrap/hover-link";
import { APP_HTML } from "@/bootstrap/html-shell";
import { loadMonaco } from "@/bootstrap/monaco-lazy";
import {
  getHoverHighlighter,
  getMonacoDiffEditor,
  refreshHoverLink,
  renderCodeDiffPage,
  wireEditToggle,
} from "@/bootstrap/monaco-page";
import {
  type NotationState,
  reapplyDiff,
  reloadScore,
  renderNotation,
  rescale,
  runDiff,
  swapScores,
  updateScaleOutput,
} from "@/bootstrap/notation-pipeline";
import { wireMeasureJump } from "@/bootstrap/measure-jump";
import { wireScrollSync } from "@/bootstrap/scroll-sync";
import { wireDiffSummary } from "@/components/diffSummary";
import { type ScoreFileDropDetail, wireFileDrop } from "@/components/fileDrop";
import { buildChildIdMap, buildMeasureIdMap, getOverlayRecords } from "@/utils/applyDiffHighlights";
import { type ChangeEntry, flattenChanges } from "@/utils/changeIndex";
import type { ChildDiffKey, ElementDiff, XMLDiffResult } from "@/utils/diffXML";
import { loadScoreFile } from "@/utils/loadScoreFile";
import { setNotationSVGIDToIndexBase } from "@/utils/setNotationSVGIDToIndexBase";
import {
  DEFAULT_SETTINGS,
  type DiffSettings,
  type DiffSettingsValue,
} from "./components/diffSettings";
import type { Pages } from "./components/pages";
import type {
  Composer,
  MXML,
  ScoreLoadDetail,
  ScoreLoader,
  ScoreLoaderSample,
} from "./components/scoreLoader";

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
const diffSettingsEl = document.querySelector<DiffSettings>("diff-settings")!;
const viewToggleBtn = document.querySelector<HTMLButtonElement>("#view-toggle")!;
const gitDiffToggleBtn = document.querySelector<HTMLButtonElement>("#git-diff-toggle")!;
const diffPageEl = document.querySelector<HTMLElement>("#diff-page")!;
const gitDiffPageEl = document.querySelector<HTMLElement>("#git-diff-page")!;
const gitDiffHunksEl = document.querySelector<HTMLElement>("#git-diff-hunks")!;
const gitDiffSplitToggleBtn = document.querySelector<HTMLButtonElement>("#git-diff-split-toggle")!;
const diffEditorContainer = document.querySelector<HTMLElement>("#diff-editor-container")!;
const diffEditToggleBtn = document.querySelector<HTMLButtonElement>("#diff-edit-toggle")!;
const prevChangeBtn = document.querySelector<HTMLButtonElement>("#prev-change")!;
const nextChangeBtn = document.querySelector<HTMLButtonElement>("#next-change")!;
const changeCounterEl = document.querySelector<HTMLSpanElement>("#change-counter")!;
const diffSummaryAside = document.querySelector<HTMLElement>("#diff-summary")!;
const diffSummaryMobileCloseBtn = document.querySelector<HTMLButtonElement>(
  "#diff-summary-mobile-close",
)!;
const diffSummaryOpenBtn = document.querySelector<HTMLButtonElement>("#toolbar-summary-open");
const swapScoresBtn = document.querySelector<HTMLButtonElement>("#swap-scores")!;
const printBtn = document.querySelector<HTMLButtonElement>("#print-btn");
const measureJumpInput = document.querySelector<HTMLInputElement>("#measure-jump-input")!;

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
  !diffEditToggleBtn ||
  !prevChangeBtn ||
  !nextChangeBtn ||
  !changeCounterEl ||
  !diffSummaryAside ||
  !diffSummaryMobileCloseBtn ||
  !swapScoresBtn ||
  !measureJumpInput
) {
  throw new Error("Required app elements not found in DOM");
}

wireScrollSync(notationContainer, notationContainer2);

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

// ─── Hover-link wiring ─────────────────────────────────────────────────────
// Overlay → Monaco and Monaco → overlay listeners are rebuilt after every
// applyDiffHighlights run because overlays are replaced from scratch each time.
// The dispose function from the previous run cleans up stale listeners before
// the new overlay set is wired.

let disposeOverlayToMonaco: (() => void) | null = null;

function rewireHoverLink(): void {
  disposeOverlayToMonaco?.();
  disposeOverlayToMonaco = null;

  const highlighter = getHoverHighlighter();
  if (!highlighter) return;

  const records = getOverlayRecords();
  disposeOverlayToMonaco = wireOverlayToMonaco(records, highlighter);
  refreshHoverLink(getOverlayRecords);
}

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
    enrichOverlays(containers);
  } catch {
    // XML is temporarily invalid while editing — skip silently
  }
}

const monacoCallbacks = {
  runDiff: () => {
    runDiff(state, containers, currentSettings);
    refreshChangeNav();
  },
  rerenderScore2: rerenderScore2Background,
};

// ─── Loading indicator ────────────────────────────────────────────────────
// Shown only while the Monaco chunk is fetching on first open. Removed once
// the editor mounts. Plain text — no spinner — respects prefers-reduced-motion.

function showMonacoLoadingIndicator(): HTMLParagraphElement {
  const p = document.createElement("p");
  p.id = "monaco-loading";
  p.textContent = "Loading editor…";
  p.style.cssText = "padding:2rem;text-align:center;color:var(--color-muted,#888);";
  diffEditorContainer.appendChild(p);
  return p;
}

function removeMonacoLoadingIndicator(el: HTMLParagraphElement): void {
  el.remove();
}

// ─── View toggle ───────────────────────────────────────────────────────────

const notationSections = [
  document.querySelector<HTMLElement>(".shared-controls")!,
  document.querySelector<HTMLElement>("#next-steps")!,
];

type View = "notation" | "monaco" | "gitdiff";
let activeView: View = "notation";

async function switchView(target: View): Promise<void> {
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
    const loadingEl = showMonacoLoadingIndicator();
    const monaco = await loadMonaco();
    removeMonacoLoadingIndicator(loadingEl);
    renderCodeDiffPage(
      monaco,
      state.originalXML,
      state.xMLToCompare,
      diffEditorContainer,
      currentSettings,
      monacoCallbacks,
      getOverlayRecords,
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

viewToggleBtn.addEventListener("click", () => void switchView("monaco"));
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
    void switchView("monaco");
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
    refreshChangeNav();
    if (activeView === "gitdiff") renderGitDiffPage(state.xmlDiff, gitDiffHunksEl, currentSettings);
  });
}

wireScoreLoader(scoreLoaderEl, 1);
wireScoreLoader(scoreLoaderEl2, 2);

// ─── File drop zones ──────────────────────────────────────────────────────

function wireDropZone(stage: HTMLElement, which: 1 | 2, slotLabel: string): void {
  wireFileDrop(stage, slotLabel);
  stage.addEventListener("score-file-drop", (e) => {
    const { file } = (e as CustomEvent<ScoreFileDropDetail>).detail;
    loadScoreFile(file)
      .then(({ xml, filename }) => {
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
        refreshChangeNav();
        if (activeView === "gitdiff") {
          renderGitDiffPage(state.xmlDiff, gitDiffHunksEl, currentSettings);
        }
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Failed to load file";
        // Surface via the stage's title so the failure is at least diagnosable.
        stage.title = message;
      });
  });
}

wireDropZone(notationContainer, 1, "score 1");
wireDropZone(notationContainer2, 2, "score 2");

// ─── Change navigation (next / prev) ──────────────────────────────────────

let currentChanges: ChangeEntry[] = [];
let currentChangeIdx = -1;

const diffSummary = wireDiffSummary(diffSummaryAside, (id) => {
  const idx = currentChanges.findIndex((c) => c.id === id);
  if (idx !== -1) focusChange(idx);
});

// ─── Mobile sidebar overlay ────────────────────────────────────────────────

function openSidebarOverlay(): void {
  diffSummaryAside.dataset.mobileOpen = "true";
  diffSummaryAside.setAttribute("aria-hidden", "false");
  diffSummaryMobileCloseBtn.focus();
}

function closeSidebarOverlay(): void {
  delete diffSummaryAside.dataset.mobileOpen;
  diffSummaryAside.setAttribute("aria-hidden", "true");
}

diffSummaryMobileCloseBtn.addEventListener("click", closeSidebarOverlay);

diffSummaryAside.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key === "Escape") closeSidebarOverlay();
});

diffSummaryOpenBtn?.addEventListener("click", openSidebarOverlay);

/**
 * Add ARIA attributes and keyboard handling to every `.diff-overlay` element
 * inside the given containers. Called after each diff render because overlays
 * are recreated on every re-apply. Each overlay already fires a `diff-navigate`
 * event on click; here we make that reachable from the keyboard too.
 */
function enrichOverlays(containers: readonly HTMLElement[]): void {
  for (const container of containers) {
    for (const overlay of container.querySelectorAll<HTMLDivElement>(".diff-overlay")) {
      if (overlay.dataset.ariaEnriched) continue;
      overlay.dataset.ariaEnriched = "true";
      overlay.setAttribute("role", "button");
      overlay.setAttribute("tabindex", "0");
      const label = overlay.dataset.diffLabel ?? "diff";
      const type = overlay.classList.contains("diff-overlay--add")
        ? "added"
        : overlay.classList.contains("diff-overlay--remove")
          ? "removed"
          : "changed";
      overlay.setAttribute("aria-label", `View diff: ${label} (${type})`);
      overlay.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          overlay.click();
        }
      });
    }
  }
  // Rebuild hover-link listeners after the overlay set is finalised.
  // This is idempotent when Monaco hasn't been opened yet (rewireHoverLink
  // guards on getHoverHighlighter returning non-null).
  rewireHoverLink();
}

function refreshChangeNav(): void {
  currentChanges = flattenChanges(state.xmlDiff);
  currentChangeIdx = currentChanges.length > 0 ? 0 : -1;
  updateChangeCounter();
  prevChangeBtn.disabled = currentChanges.length === 0;
  nextChangeBtn.disabled = currentChanges.length === 0;
  swapScoresBtn.disabled = !state.originalXML || !state.xMLToCompare;
  diffSummary.refresh(currentChanges);
  enrichOverlays(containers);
}

function updateChangeCounter(): void {
  if (currentChanges.length === 0) {
    changeCounterEl.textContent = "0 of 0";
    return;
  }
  changeCounterEl.textContent = `${currentChangeIdx + 1} of ${currentChanges.length}`;
}

/**
 * Scroll both notation stages so the overlay for the active change is in
 * view, then briefly pulse the overlay so the user can spot it. Falls back
 * silently when the change has no rendered overlay (e.g. a credit on a page
 * that isn't currently shown).
 */
function focusChange(idx: number): void {
  if (idx < 0 || idx >= currentChanges.length) return;
  currentChangeIdx = idx;
  updateChangeCounter();
  const change = currentChanges[idx];

  for (const container of containers) {
    container.querySelectorAll(".diff-overlay--focus").forEach((el) => {
      el.classList.remove("diff-overlay--focus");
    });
    const overlays = container.querySelectorAll<HTMLDivElement>(".diff-overlay");
    for (const overlay of overlays) {
      if (overlay.dataset.diffLabel === change.diff.label) {
        overlay.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        overlay.classList.add("diff-overlay--focus");
        setTimeout(() => overlay.classList.remove("diff-overlay--focus"), 1700);
        break;
      }
    }
  }
}

prevChangeBtn.addEventListener("click", () => {
  if (currentChanges.length === 0) return;
  focusChange((currentChangeIdx - 1 + currentChanges.length) % currentChanges.length);
});
nextChangeBtn.addEventListener("click", () => {
  if (currentChanges.length === 0) return;
  focusChange((currentChangeIdx + 1) % currentChanges.length);
});

document.addEventListener("keydown", (e) => {
  const target = e.target as HTMLElement | null;
  if (
    target &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable ||
      target.closest(".monaco-editor"))
  ) {
    return;
  }
  if (currentChanges.length === 0) return;
  if (e.key === "j" || e.key === "ArrowDown") {
    e.preventDefault();
    focusChange((currentChangeIdx + 1) % currentChanges.length);
  } else if (e.key === "k" || e.key === "ArrowUp") {
    e.preventDefault();
    focusChange((currentChangeIdx - 1 + currentChanges.length) % currentChanges.length);
  }
});

// ─── Button wiring ─────────────────────────────────────────────────────────

swapScoresBtn.addEventListener("click", () => {
  const filename1 =
    document.querySelector<HTMLElement>(".diff-file-old")?.textContent?.trim() ?? "";
  const filename2 =
    document.querySelector<HTMLElement>(".diff-file-new")?.textContent?.trim() ?? "";

  swapScores(
    state,
    containers,
    [paginationEl, paginationEl2],
    sharedScaleInput,
    currentSettings,
    makeModelUpdateCb(),
    makeFilenameCb(),
    filename1,
    filename2,
  );
  refreshChangeNav();
  if (activeView === "gitdiff") renderGitDiffPage(state.xmlDiff, gitDiffHunksEl, currentSettings);
});

printBtn?.addEventListener("click", () => window.print());

// ─── Measure-jump wiring ───────────────────────────────────────────────────

wireMeasureJump(measureJumpInput, {
  state,
  containers,
  paginations: [paginationEl, paginationEl2],
});

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
  enrichOverlays(containers);
});

scale1Input.addEventListener("input", () => {
  const scale = Number(scale1Input.value);
  updateScaleOutput(scale1Output, scale);
  if (!state.toolkit) return;
  rescale(state.toolkit, paginationEl, notationContainer, scale);
  reapplyDiff(state, containers, currentSettings.showLineNumbers);
  enrichOverlays(containers);
});

scale2Input.addEventListener("input", () => {
  const scale = Number(scale2Input.value);
  updateScaleOutput(scale2Output, scale);
  if (!state.toolkit2) return;
  rescale(state.toolkit2, paginationEl2, notationContainer2, scale);
  reapplyDiff(state, containers, currentSettings.showLineNumbers);
  enrichOverlays(containers);
});

// ─── Diff settings listener ────────────────────────────────────────────────

diffSettingsEl.addEventListener("settings-change", (e) => {
  currentSettings = (e as CustomEvent<DiffSettingsValue>).detail;
  const isSplit = currentSettings.gitDiffOrientation === "split";
  gitDiffSplitToggleBtn.setAttribute("aria-pressed", String(isSplit));
  gitDiffSplitToggleBtn.textContent = isSplit ? "Unified" : "Split";
  document.documentElement.dataset.palette = currentSettings.colorblindPalette
    ? "colorblind"
    : "default";
  runDiff(state, containers, currentSettings);
  refreshChangeNav();
  if (activeView === "monaco") {
    void loadMonaco().then((monaco) => {
      renderCodeDiffPage(
        monaco,
        state.originalXML,
        state.xMLToCompare,
        diffEditorContainer,
        currentSettings,
        monacoCallbacks,
      );
    });
  }
});

// ─── Page-change listeners ─────────────────────────────────────────────────

paginationEl.addEventListener("page-change", () => {
  setNotationSVGIDToIndexBase(notationContainer);
  reapplyDiff(state, containers, currentSettings.showLineNumbers);
  enrichOverlays(containers);
});

paginationEl2.addEventListener("page-change", () => {
  setNotationSVGIDToIndexBase(notationContainer2);
  reapplyDiff(state, containers, currentSettings.showLineNumbers);
  enrichOverlays(containers);
});

// ─── Verovio initialisation ────────────────────────────────────────────────

verovio.module.onRuntimeInitialized = async () => {
  state.toolkit = new verovio.toolkit();
  state.toolkit2 = new verovio.toolkit();

  try {
    const findScore = (id: string) => SAMPLE_SCORES.find((s) => s.id === id)?.xml ?? null;
    state.originalXML = findScore("Chopin-etudeOp10No1V2") ?? SAMPLE_SCORES[0]?.xml ?? null;
    state.xMLToCompare = findScore("Chopin-etudeOp10No1") ?? SAMPLE_SCORES[1]?.xml ?? null;

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
    refreshChangeNav();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    notationContainer.textContent = `Unable to load score: ${message}`;
  }
};
