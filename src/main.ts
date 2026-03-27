/**
 * Application entry point for MusicDiff.
 *
 * Responsibilities:
 *  1. Bootstrap the Verovio WASM toolkit and render two MusicXML scores
 *     side-by-side.
 *  2. Compute a structural diff between the two scores and overlay visual
 *     highlights on changed measures and header text.
 *  3. Wire up shared and per-score scale controls, pagination, theme toggle,
 *     and the diff-settings panel.
 */

// ─── Styles & side-effect imports ─────────────────────────────────────────
import "./style.css";
import "./components/notation/note";
import "./components/themeToggle";
import "./components/pages";
import "./components/diffSettings";

// ─── Utilities ────────────────────────────────────────────────────────────
import { setNotationSVGIDToIndexBase } from "@/utils/setNotationSVGIDToIndexBase";
import { getTotalPageCount } from "@/utils/getTotalPageCount";
import {
  diffXML,
  type XMLDiffOptions,
  type XMLDiffResult,
  type ElementDiff,
  type DiffLine,
} from "@/utils/diffXML";
import {
  applyDiffHighlights,
  buildMeasureIdMap,
} from "@/utils/applyDiffHighlights";

// ─── Monaco editor ────────────────────────────────────────────────────────
// Register Monaco's web worker before the editor is created.
// Vite handles `?worker` imports natively — no plugin needed.
// XML only needs the base editor worker (no separate language server).
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

self.MonacoEnvironment = {
  getWorker(_id: string, _label: string): Worker {
    return new EditorWorker();
  },
};

import * as monaco from "monaco-editor";

// ─── Verovio ──────────────────────────────────────────────────────────────
import * as verovio from "verovio";
import { type VerovioOptions, toolkit as Toolkit } from "verovio";

// ─── Score sources (Vite raw imports) ─────────────────────────────────────
// @ts-ignore: raw import as string
import etudeMei from "@/scores/Chopin/etudeOp10No1.xml?raw";
// @ts-ignore: raw import as string
import etudeMei2 from "@/scores/Chopin/etudeOp10No2.xml?raw";

import type { Pages } from "./components/pages";
import {
  DEFAULT_SETTINGS,
  type DiffSettingsValue,
} from "./components/diffSettings";

// ─── DOM bootstrap ────────────────────────────────────────────────────────

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root element not found");

/**
 * Static HTML shell. Pagination components and runtime state are injected
 * below after `verovio.module.onRuntimeInitialized` fires.
 *
 * Layout:
 *  - `#toolbar`          – app title, diff-settings gear, theme toggle
 *  - `.shared-controls`  – scale slider that moves both scores together
 *  - `#next-steps`       – two-column layout, one column per score
 *    - each column: individual scale + pagination (injected) + notation-stage
 */
app.innerHTML = `
<header id="toolbar">
  <div class="toolbar-start">
    <span class="app-title">MusicDiff</span>
    <button
      id="view-toggle"
      class="view-toggle-btn"
      type="button"
      aria-label="Monaco diff view"
      aria-pressed="false"
      title="Monaco diff editor"
    >
      <!-- Lucide "code-xml" -->
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m18 16 4-4-4-4"/>
        <path d="m6 8-4 4 4 4"/>
        <path d="m14.5 4-5 16"/>
      </svg>
    </button>
    <button
      id="git-diff-toggle"
      class="view-toggle-btn"
      type="button"
      aria-label="Git diff view"
      aria-pressed="false"
      title="Git-style diff view"
    >
      <!-- Lucide "file-diff" -->
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
        <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
        <path d="M8 18v-2"/>
        <path d="M8 14v-2"/>
        <path d="M16 18h-4"/>
        <path d="M16 14h-2"/>
      </svg>
    </button>
  </div>
  <div class="toolbar-end">
    <diff-settings></diff-settings>
    <theme-toggle></theme-toggle>

  </div>
</header>

<!-- Diff page: Monaco side-by-side diff editor, hidden by default -->
<section id="diff-page" aria-label="Raw diff view">
  <div class="diff-page-file-header">
    <span class="diff-file-old">scores/Chopin/etudeOp10No1.xml</span>
    <span class="diff-file-new">scores/Chopin/etudeOp10No2.xml</span>
    <button id="diff-edit-toggle" class="diff-edit-btn" type="button" aria-pressed="false" title="Toggle edit mode">Edit</button>
  </div>
  <div id="diff-editor-container"></div>
  <!-- <div id="single-editor-container"></div> -->
</section>

<!-- Git diff page: hunked unified/split diff view, hidden by default -->
<section id="git-diff-page" aria-label="Git diff view">
  <div class="diff-page-file-header">
    <span class="diff-file-old">--- scores/Chopin/etudeOp10No1.xml</span>
    <span class="diff-file-new">+++ scores/Chopin/etudeOp10No2.xml</span>
    <button id="git-diff-split-toggle" class="diff-edit-btn" type="button" aria-pressed="false" title="Toggle side-by-side view">Split</button>
  </div>
  <div class="diff-page-hunks" id="git-diff-hunks"></div>
</section>

    <div class="ticks"></div>
<div class="notation-controls shared-controls">
  <label for="notation-scale">Scale (both)</label>
  <input id="notation-scale" type="range" min="40" max="140" step="5" value="80" />
  <output id="notation-scale-value" for="notation-scale">80%</output>
</div>

<section id="next-steps">
  <div id="docs">
    <div class="notation-panel">
      <div class="notation-controls individual-controls">
        <label for="scale-1">Scale</label>
        <input id="scale-1" type="range" min="40" max="140" step="5" value="80" />
        <output id="scale-1-value" for="scale-1">80%</output>
      </div>
      <div id="XML-notation" class="notation-stage">Loading score…</div>
    </div>
  </div>
  <div id="social">
    <div class="notation-panel">
      <div class="notation-controls individual-controls">
        <label for="scale-2">Scale</label>
        <input id="scale-2" type="range" min="40" max="140" step="5" value="80" />
        <output id="scale-2-value" for="scale-2">80%</output>
      </div>
      <div id="XML-notation-compare" class="notation-stage">Loading score…</div>
    </div>
  </div>
</section>

<div class="ticks"></div>
<section id="spacer"></section>
`;

// ─── Element queries ───────────────────────────────────────────────────────

const root = document.documentElement;
const notationContainer =
  document.querySelector<HTMLDivElement>("#XML-notation")!;
const notationContainer2 = document.querySelector<HTMLDivElement>(
  "#XML-notation-compare",
)!;
const notationPanel = document.querySelector<HTMLDivElement>(
  "#docs .notation-panel",
)!;
const notationPanel2 = document.querySelector<HTMLDivElement>(
  "#social .notation-panel",
)!;

/** Shared scale: moves both scores simultaneously. */
const sharedScaleInput =
  document.querySelector<HTMLInputElement>("#notation-scale")!;
const sharedScaleOutput = document.querySelector<HTMLOutputElement>(
  "#notation-scale-value",
)!;

/** Per-score scale: overrides just one score, other remains unchanged. */
const scale1Input = document.querySelector<HTMLInputElement>("#scale-1")!;
const scale1Output =
  document.querySelector<HTMLOutputElement>("#scale-1-value")!;
const scale2Input = document.querySelector<HTMLInputElement>("#scale-2")!;
const scale2Output =
  document.querySelector<HTMLOutputElement>("#scale-2-value")!;

const diffSettingsEl = document.querySelector<HTMLElement>("diff-settings")!;
const viewToggleBtn =
  document.querySelector<HTMLButtonElement>("#view-toggle")!;
const gitDiffToggleBtn =
  document.querySelector<HTMLButtonElement>("#git-diff-toggle")!;
const diffPageEl = document.querySelector<HTMLElement>("#diff-page")!;
const gitDiffPageEl = document.querySelector<HTMLElement>("#git-diff-page")!;
const gitDiffHunksEl = document.querySelector<HTMLElement>("#git-diff-hunks")!;
const gitDiffSplitToggleBtn = document.querySelector<HTMLButtonElement>(
  "#git-diff-split-toggle",
)!;

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
  !gitDiffSplitToggleBtn
) {
  throw new Error("Required app elements not found in DOM");
}

// ─── Pagination components ─────────────────────────────────────────────────
// Created immediately so they're in the DOM before Verovio initialises; the
// `toolkit` property is set later once the WASM is ready.

/** Pagination for score 1 (old / left). */
const paginationEl: Pages = document.createElement("page-pagination");
/** Pagination for score 2 (new / right). */
const paginationEl2: Pages = document.createElement("page-pagination");

paginationEl.notationContainer = notationContainer;
paginationEl2.notationContainer = notationContainer2;

// Prepend so pagination sits above the notation stage inside each panel
notationPanel.prepend(paginationEl);
notationPanel2.prepend(paginationEl2);

// ─── Mutable rendering state ───────────────────────────────────────────────

// type Theme = "light" | "dark";

let meiXML: string | null = null;
let meiXML2: string | null = null;
let toolkit: Toolkit | null = null;
let toolkit2: Toolkit | null = null;

/** Cached diff result, recomputed when settings change. */
let xmlDiff: XMLDiffResult | null = null;

/** Single source of truth for all user-configurable diff settings. */
let currentSettings: DiffSettingsValue = { ...DEFAULT_SETTINGS };

/**
 * SVG id → MusicXML measure number maps, built once after each `loadData`.
 * Used by {@link applyDiffHighlights} to identify which measure each
 * `g.measure` SVG element corresponds to on any page.
 */
let measureIdMap1 = new Map<string, number>();
let measureIdMap2 = new Map<string, number>();
// ─── Theme ─────────────────────────────────────────────────────────────────
const themeStorageKey = "theme-preference";
const themeMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
//
// const applyTheme = (theme: Theme, persist = false) => {
//   root.dataset.theme = theme;
//   // Keep Monaco in sync — setTheme is global across all editor instances
//   monaco.editor.setTheme(theme === "dark" ? "vs-dark" : "vs-light");
//   if (persist) window.localStorage.setItem(themeStorageKey, theme);
// };
//
// const savedTheme = window.localStorage.getItem(themeStorageKey);
// if (savedTheme === "light" || savedTheme === "dark") {
//   applyTheme(savedTheme);
// }
//
themeMediaQuery.addEventListener("change", (_) => {
  if (window.localStorage.getItem(themeStorageKey)) return;
});

// ─── Scale helpers ─────────────────────────────────────────────────────────

/**
 * Update a scale `<output>` element's displayed value.
 *
 * @param output The `<output>` element to update.
 * @param scale  Scale percentage (e.g. 80 for 80%).
 */
function updateScaleOutput(output: HTMLOutputElement, scale: number): void {
  output.value = `${scale}%`;
  output.textContent = `${scale}%`;
}

/**
 * Re-render one score at a new scale.
 *
 * Calls `toolkit.setOptions({ scale })` (preserving all other options) then
 * `toolkit.redoLayout()` to recalculate page breaks for the new size, and
 * finally `toolkit.renderToSVG(page)` to produce the updated SVG. The
 * pagination total is also refreshed because scale changes can alter how many
 * pages the score occupies.
 *
 * @param tk         The Verovio toolkit instance owning the score.
 * @param pagination The pagination component bound to this score.
 * @param container  The `.notation-stage` `<div>` that receives the SVG.
 * @param scale      New scale percentage (Verovio range: 1–1000).
 */
function rescale(
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
 * so that overlays are repositioned over the freshly rendered elements.
 */
function reapplyDiff(): void {
  if (!xmlDiff) return;
  applyDiffHighlights(
    notationContainer,
    notationContainer2,
    xmlDiff,
    measureIdMap1,
    measureIdMap2,
  );
}

/**
 * (Re-)compute the diff with the given options and apply highlights.
 *
 * Stores the result in `xmlDiff` so it can be re-applied cheaply on
 * subsequent re-renders without a full re-diff.
 *
 * @param opts Diff options; defaults to the last options set by the user.
 */
function runDiff(opts: XMLDiffOptions = currentSettings): void {
  if (!meiXML || !meiXML2) return;
  xmlDiff = diffXML(meiXML, meiXML2, opts);
  reapplyDiff();
  // Monaco renders its own diff from its models — it does not read xmlDiff.
  // Only the git diff page needs an explicit refresh here.
  if (activeView === "gitdiff") renderGitDiffPage();
}

// ─── Monaco diff editor ────────────────────────────────────────────────────

/** Singleton Monaco diff editor, created lazily on first view toggle. */
let monacoDiffEditor: monaco.editor.IStandaloneDiffEditor | null = null;
// let monacoSingleEditor: monaco.editor.IStandaloneCodeEditor | null = null;

/** Whether the modified (right) pane is currently editable. */
let diffEditorEditable = false;

/** Disposable for the modified-editor content listener (re-created with each new model). */
let monacoContentDisposable: monaco.IDisposable | null = null;

/** Container div that Monaco mounts into (child of `#diff-page`). */
const diffEditorContainer = document.querySelector<HTMLElement>(
  "#diff-editor-container",
)!;
// const singleEditorContainer = document.querySelector<HTMLElement>(
//   "#single-editor-container",
// )!;

/** Edit-mode toggle button in the diff page header. */
const diffEditToggleBtn =
  document.querySelector<HTMLButtonElement>("#diff-edit-toggle")!;

diffEditToggleBtn.addEventListener("click", () => {
  diffEditorEditable = !diffEditorEditable;
  monacoDiffEditor
    ?.getModifiedEditor()
    .updateOptions({ readOnly: !diffEditorEditable });
  diffEditToggleBtn.setAttribute("aria-pressed", String(diffEditorEditable));
  diffEditToggleBtn.textContent = diffEditorEditable ? "Read-only" : "Edit";
});

/**
 * Minimal generic debounce — waits `ms` milliseconds of silence before
 * calling `fn`. Resets the timer on every new call.
 */
function debounce<T extends unknown[]>(
  fn: (...args: T) => void,
  ms: number,
): (...args: T) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: T) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Propagate Monaco edits back to the rest of the app.
 *
 * Called (debounced) whenever the user types in the modified pane:
 * 1. Reads the current XML out of Monaco and updates `meiXML2`.
 * 2. Re-runs the LCS diff so SVG overlays and the git diff page reflect the change.
 * 3. Re-renders the Verovio score 2 in the background so the notation view is
 *    ready with updated highlights when the user switches back. Invalid XML
 *    during mid-edit is silently ignored.
 */
const syncFromMonaco = debounce(() => {
  if (!monacoDiffEditor || !meiXML) return;
  meiXML2 = monacoDiffEditor.getModifiedEditor().getValue();

  // Recompute LCS diff + SVG overlays (runDiff no longer touches Monaco)
  runDiff();

  // Re-render Verovio score 2 in the background (notation may be hidden)
  if (toolkit2) {
    try {
      const scale = Number(scale2Input.value);
      renderNotation(
        meiXML2,
        paginationEl2,
        toolkit2,
        notationContainer2,
        scale,
      );
      measureIdMap2 = buildMeasureIdMap(toolkit2);
      reapplyDiff(); // re-overlay with fresh measure map
    } catch {
      // XML is temporarily invalid while editing — skip silently
    }
  }
}, 600);

/**
 * Return the Monaco theme string that matches the current app theme.
 * NOTE: Only on first render, subsequent theme changes are handled in the theme-toggle btn element
 */
function getMonacoTheme(): string {
  return (root.dataset.theme ?? "light") === "dark" ? "vs-dark" : "vs-light";
}

/**
 * Mount or update the Monaco side-by-side diff editor.
 *
 * **First call** — creates the editor, sets the initial models (original XML
 * on the left, score 2 on the right), and wires up the content-change
 * listener so edits propagate back via {@link syncFromMonaco}.
 *
 * **Subsequent calls** — only updates visual options (line numbers, theme).
 * Models are intentionally left untouched so user edits are not lost when
 * diff settings change.
 */
function renderCodeDiffPage(): void {
  if (!meiXML || !meiXML2) return;

  if (!monacoDiffEditor) {
    // monacoSingleEditor = monaco.editor.create(singleEditorContainer, {
    //   value:
    //     "yooooosdsajlksd lkslkj lsjdlk sdj lksj dslkd jdslkd jslkd jlksdj k",
    //   language: "markdown",
    //   automaticLayout: true,
    // });
    monacoDiffEditor = monaco.editor.createDiffEditor(diffEditorContainer, {
      renderSideBySide: true,
      originalEditable: false, // left pane always read-only
      readOnly: true, // right pane starts read-only
      automaticLayout: true,
      scrollBeyondLastLine: false,
      lineNumbers: currentSettings.showLineNumbers ? "on" : "off",
      minimap: { enabled: currentSettings.showMiniMap },
      wordWrap: "on",
      theme: getMonacoTheme(),
      fontSize: 13,
      useShadowDOM: true,
      smoothScrolling: true,
      showDeprecated: true,
    });

    // Set models only on first mount
    monacoDiffEditor.setModel({
      original: monaco.editor.createModel(meiXML, "xml"),
      modified: monaco.editor.createModel(meiXML2, "xml"),
    });

    // Wire up the live-sync listener
    monacoContentDisposable?.dispose();
    monacoContentDisposable = monacoDiffEditor
      .getModifiedEditor()
      .onDidChangeModelContent(syncFromMonaco);
  } else {
    // Preserve user edits — only update appearance options
    monacoDiffEditor.updateOptions({
      lineNumbers: currentSettings.showLineNumbers ? "on" : "off",
      minimap: { enabled: currentSettings.showMiniMap },
    });
    monaco.editor.setTheme(getMonacoTheme());
  }
}

// ─── Git diff page (hunked HTML view) ──────────────────────────────────────

/** Escape `<`, `>`, `&` for safe HTML text injection. */
function escapeHTML(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

gitDiffSplitToggleBtn.addEventListener("click", () => {
  const next =
    currentSettings.gitDiffOrientation === "split" ? "unified" : "split";
  currentSettings = { ...currentSettings, gitDiffOrientation: next };
  // Push the change back into the settings panel so the gear UI stays in sync
  (diffSettingsEl as unknown as { value: DiffSettingsValue }).value =
    currentSettings;
  gitDiffSplitToggleBtn.setAttribute("aria-pressed", String(next === "split"));
  gitDiffSplitToggleBtn.textContent = next === "split" ? "Unified" : "Split";
  renderGitDiffPage();
});

/**
 * Build a cell for one side of a split-view row.
 *
 * @param line  The diff line to render, or `undefined` for an empty cell
 *              (shown when one side has no paired counterpart).
 */
function splitCellHTML(line: DiffLine | undefined): string {
  if (!line) {
    return `<div class="diff-split-cell diff-line-empty"></div>`;
  }
  const glyph = line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";
  return (
    `<div class="diff-split-cell diff-line-${line.type}">` +
    `<span class="diff-page-gutter">${glyph}</span>` +
    `<span class="diff-page-code">${escapeHTML(line.content)}</span>` +
    `</div>`
  );
}

/**
 * Render one element diff hunk as a unified (single-column) block.
 */
function unifiedHunkHTML(diff: ElementDiff): string {
  const linesHTML = diff.lines
    .map((l) => {
      const glyph = l.type === "add" ? "+" : l.type === "remove" ? "-" : " ";
      return (
        `<div class="diff-page-line diff-line-${l.type}">` +
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
function splitHunkHTML(diff: ElementDiff): string {
  type SplitRow =
    | { kind: "context"; line: DiffLine }
    | { kind: "change"; remove?: DiffLine; add?: DiffLine };

  // Group consecutive removes and adds into paired change rows
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
        // Context lines: same content duplicated in both cells
        const code = escapeHTML(row.line.content);
        return (
          `<div class="diff-split-row">` +
          `<div class="diff-split-cell diff-line-context"><span class="diff-page-gutter"> </span><span class="diff-page-code">${code}</span></div>` +
          `<div class="diff-split-cell diff-line-context"><span class="diff-page-gutter"> </span><span class="diff-page-code">${code}</span></div>` +
          `</div>`
        );
      }
      return (
        `<div class="diff-split-row">` +
        splitCellHTML(row.remove) +
        splitCellHTML(row.add) +
        `</div>`
      );
    })
    .join("");

  return `<div class="diff-hunk-header">@@ ${diff.label} @@</div>${rowsHTML}`;
}

/**
 * Render the git diff page in either unified or split mode depending on
 * `currentSettings.gitDiffOrientation`. Credits first, measures in ascending order.
 */
function renderGitDiffPage(): void {
  if (!xmlDiff || (xmlDiff.measures.size === 0 && xmlDiff.credits.size === 0)) {
    gitDiffHunksEl.innerHTML = `<p class="diff-page-empty">No differences found between the two scores.</p>`;
    return;
  }

  const isSplit = currentSettings.gitDiffOrientation === "split";
  const hunkFn = isSplit ? splitHunkHTML : unifiedHunkHTML;

  const creditHunks = [...xmlDiff.credits.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, d]) => hunkFn(d))
    .join("");

  const measureHunks = [...xmlDiff.measures.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, d]) => hunkFn(d))
    .join("");

  gitDiffHunksEl.innerHTML = creditHunks + measureHunks;

  // Toggle the CSS class on the container so styles can target each mode
  gitDiffHunksEl.classList.toggle("is-split", isSplit);
}

// ─── View toggle ───────────────────────────────────────────────────────────

/** The two main sections that are mutually exclusive. */
const notationSections = [
  document.querySelector<HTMLElement>(".shared-controls")!,
  document.querySelector<HTMLElement>("#next-steps")!,
];

/** Which view is currently shown. */
type View = "notation" | "monaco" | "gitdiff";
let activeView: View = "notation";

/**
 * Switch to `target` view, or back to `"notation"` if `target` is already
 * active (acts as a toggle so clicking the active button de-selects it).
 */
function switchView(target: View): void {
  activeView = activeView === target ? "notation" : target;

  const isMonaco = activeView === "monaco";
  const isGitDiff = activeView === "gitdiff";
  const isNotation = activeView === "notation";

  // Update toolbar button pressed states
  viewToggleBtn.setAttribute("aria-pressed", String(isMonaco));
  gitDiffToggleBtn.setAttribute("aria-pressed", String(isGitDiff));

  // Show/hide the notation panels
  notationSections.forEach((el) => {
    if (el) el.style.display = isNotation ? "" : "none";
  });

  // Monaco diff page
  if (isMonaco) {
    diffPageEl.classList.add("visible");
    renderCodeDiffPage();
    // One rAF so Monaco can measure the now-visible container
    requestAnimationFrame(() => monacoDiffEditor?.layout());
  } else {
    diffPageEl.classList.remove("visible");
  }

  // Git diff page
  if (isGitDiff) {
    gitDiffPageEl.classList.add("visible");
    renderGitDiffPage();
  } else {
    gitDiffPageEl.classList.remove("visible");
  }
}

viewToggleBtn.addEventListener("click", () => switchView("monaco"));
gitDiffToggleBtn.addEventListener("click", () => switchView("gitdiff"));

// ─── Scale event listeners ─────────────────────────────────────────────────

/**
 * Shared scale slider — moves both scores to the same scale simultaneously.
 * Also synchronises the two individual scale inputs so they visually reflect
 * the current shared value.
 */
sharedScaleInput.addEventListener("input", () => {
  const scale = Number(sharedScaleInput.value);
  updateScaleOutput(sharedScaleOutput, scale);

  // Keep individual sliders in sync with the shared value
  scale1Input.value = String(scale);
  scale2Input.value = String(scale);
  updateScaleOutput(scale1Output, scale);
  updateScaleOutput(scale2Output, scale);

  if (!toolkit || !toolkit2) return;
  rescale(toolkit, paginationEl, notationContainer, scale);
  rescale(toolkit2, paginationEl2, notationContainer2, scale);
  reapplyDiff();
});

/**
 * Individual scale for score 1 — rescales the left score only.
 * The shared slider and score 2 are unaffected.
 */
scale1Input.addEventListener("input", () => {
  const scale = Number(scale1Input.value);
  updateScaleOutput(scale1Output, scale);
  if (!toolkit) return;
  rescale(toolkit, paginationEl, notationContainer, scale);
  reapplyDiff();
});

/**
 * Individual scale for score 2 — rescales the right score only.
 * The shared slider and score 1 are unaffected.
 */
scale2Input.addEventListener("input", () => {
  const scale = Number(scale2Input.value);
  updateScaleOutput(scale2Output, scale);
  if (!toolkit2) return;
  rescale(toolkit2, paginationEl2, notationContainer2, scale);
  reapplyDiff();
});

// ─── Diff settings listener ────────────────────────────────────────────────

/**
 * Re-run the diff whenever the user changes a setting in the gear dropdown.
 * The `settings-change` event is fired by `<diff-settings>` with a
 * {@link DiffSettingsValue} detail containing the new option values.
 */
diffSettingsEl.addEventListener("settings-change", (e) => {
  currentSettings = (e as CustomEvent<DiffSettingsValue>).detail;
  // Sync the split toggle button label with the orientation from settings
  const isSplit = currentSettings.gitDiffOrientation === "split";
  gitDiffSplitToggleBtn.setAttribute("aria-pressed", String(isSplit));
  gitDiffSplitToggleBtn.textContent = isSplit ? "Unified" : "Split";
  runDiff(currentSettings);
  if (activeView === "monaco") renderCodeDiffPage();
});

// ─── Page-change listeners ─────────────────────────────────────────────────
// The Pages component updates `notationContainer.innerHTML` synchronously
// before emitting `page-change`, so highlights and ID remapping can be
// applied immediately in the handler.

/** After score 1 turns a page: remap IDs and refresh overlays. */
paginationEl.addEventListener("page-change", () => {
  setNotationSVGIDToIndexBase(notationContainer);
  reapplyDiff();
});

/** After score 2 turns a page: remap IDs and refresh overlays. */
paginationEl2.addEventListener("page-change", () => {
  setNotationSVGIDToIndexBase(notationContainer2);
  reapplyDiff();
});

// ─── Verovio initialisation ────────────────────────────────────────────────

/**
 * Initial render of one score.
 *
 * Order of operations matters:
 *  1. `loadData`    — parse and validate the MusicXML; must precede any
 *                     other toolkit call that depends on the loaded data.
 *  2. `setOptions`  — apply rendering options (scale, breaks, etc.).
 *  3. `getPageCount`— accurate only after loadData + setOptions.
 *  4. `renderToSVG` — produce the SVG for the first page.
 *
 * @param xmlFile    Raw MusicXML string.
 * @param pagination Pagination component bound to this score.
 * @param tk         Initialised Verovio toolkit instance.
 * @param container  `.notation-stage` element to receive the rendered SVG.
 * @param scale      Initial scale percentage.
 */
function renderNotation(
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

  tk.loadData(xmlFile); // Step 1 – must come before setOptions / getPageCount
  tk.setOptions(options); // Step 2

  pagination.total = getTotalPageCount(tk); // Step 3 – accurate now
  pagination.toolkit = tk;

  container.innerHTML = tk.renderToSVG(pagination.page); // Step 4
  setNotationSVGIDToIndexBase(container);
}

/**
 * Verovio WASM runtime ready callback.
 *
 * Creates two toolkit instances (one per score), renders both scores at the
 * initial scale, builds per-score measure ID maps for page-aware highlighting,
 * then runs the initial diff.
 */
verovio.module.onRuntimeInitialized = async () => {
  toolkit = new verovio.toolkit();
  toolkit2 = new verovio.toolkit();

  try {
    meiXML = etudeMei as string;
    meiXML2 = etudeMei2 as string;

    const scale = Number(sharedScaleInput.value);
    updateScaleOutput(sharedScaleOutput, scale);
    updateScaleOutput(scale1Output, scale);
    updateScaleOutput(scale2Output, scale);

    renderNotation(meiXML, paginationEl, toolkit, notationContainer, scale);
    renderNotation(meiXML2, paginationEl2, toolkit2, notationContainer2, scale);

    // Build id maps after loadData so getMEI returns valid data
    measureIdMap1 = buildMeasureIdMap(toolkit);
    measureIdMap2 = buildMeasureIdMap(toolkit2);

    runDiff();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    notationContainer.textContent = `Unable to load score: ${message}`;
  }
};
