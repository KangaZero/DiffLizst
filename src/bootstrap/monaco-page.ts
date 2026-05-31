import type * as Monaco from "monaco-editor";
import {
  createMonacoHighlighter,
  type MonacoHighlighter,
  type OverlayRecord,
  wireMonacoToOverlay,
} from "@/bootstrap/hover-link";
import type { DiffSettingsValue } from "@/components/diffSettings";

// ─── Types ──────────────────────────────────────────────────────────────────

/**
 * Callbacks that monaco-page needs from main.ts for cross-cutting concerns
 * (re-diff after edits, re-render notation in background).
 */
export interface MonacoCallbacks {
  runDiff: () => void;
  rerenderScore2: (xml: string) => void;
}

// ─── Module-local singletons (monaco-page owns these, not main.ts) ──────────

/** Singleton Monaco diff editor created on first view toggle. */
let monacoDiffEditor: Monaco.editor.IStandaloneDiffEditor | null = null;

/** Whether the modified (right) pane is currently editable. */
let diffEditorEditable = false;

// ─── Hover-link singletons ────────────────────────────────────────────────────

/** Manages Monaco line decorations triggered by overlay hover. */
let hoverHighlighter: MonacoHighlighter | null = null;

/** Dispose function returned by wireMonacoToOverlay — clears Monaco → overlay listeners. */
let disposeMonacoToOverlay: (() => void) | null = null;

// ─── Debounce ────────────────────────────────────────────────────────────────

function debounce<T extends unknown[]>(fn: (...args: T) => void, ms: number): (...args: T) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: T) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ─── Monaco helpers ──────────────────────────────────────────────────────────

/**
 * Return the Monaco theme string that matches the current app theme.
 * Only used on first render — subsequent theme changes are handled in the
 * theme-toggle element.
 */
export function getMonacoTheme(): string {
  return (document.documentElement.dataset.theme ?? "light") === "dark" ? "vs-dark" : "vs-light";
}

/**
 * Expose the singleton editor so main.ts can use it for navigation and
 * model updates without monaco-page needing to know about those call sites.
 */
export function getMonacoDiffEditor(): Monaco.editor.IStandaloneDiffEditor | null {
  return monacoDiffEditor;
}

// ─── Hover-link public API ────────────────────────────────────────────────────

/**
 * Rebuild the bidirectional hover link after each applyDiffHighlights run.
 *
 * Called from main.ts wherever overlays are rebuilt (runDiff, reapplyDiff,
 * rerenderScore2Background). If the editor hasn't been opened yet this is a
 * no-op — the link is wired on first renderCodeDiffPage instead.
 *
 * @param getRecords  Getter returning the current OverlayRecord list. The
 *                    Monaco → overlay listener calls this on every mousemove so
 *                    it always operates on the freshest set without a closure
 *                    over a stale snapshot.
 */
export function refreshHoverLink(getRecords: () => readonly OverlayRecord[]): void {
  if (!monacoDiffEditor) return;

  // Tear down previous Monaco → overlay wiring before installing new one.
  disposeMonacoToOverlay?.();
  disposeMonacoToOverlay = wireMonacoToOverlay(monacoDiffEditor, getRecords);

  // Highlighter is stateful (it holds decoration collection handles), reuse it.
  if (!hoverHighlighter) {
    hoverHighlighter = createMonacoHighlighter(monacoDiffEditor);
  }
}

/**
 * Expose the current MonacoHighlighter so applyDiffHighlights' wiring step
 * (wireOverlayToMonaco) can be done in main.ts with the fresh overlay set.
 */
export function getHoverHighlighter(): MonacoHighlighter | null {
  return hoverHighlighter;
}

// ─── Edit-toggle wiring ──────────────────────────────────────────────────────

/**
 * Wire the edit-mode toggle button to the Monaco editor read-only flag.
 * Called once from main.ts after the DOM is ready.
 */
export function wireEditToggle(btn: HTMLButtonElement): void {
  btn.addEventListener("click", () => {
    diffEditorEditable = !diffEditorEditable;
    monacoDiffEditor?.getModifiedEditor().updateOptions({ readOnly: !diffEditorEditable });
    btn.setAttribute("aria-pressed", String(diffEditorEditable));
    btn.textContent = diffEditorEditable ? "Read-only" : "Edit";
  });
}

// ─── Sync from Monaco ────────────────────────────────────────────────────────

/**
 * Propagate Monaco edits back to the rest of the app (debounced at 600 ms).
 *
 * 1. Reads current XML from the modified pane and hands it back via
 *    `callbacks.rerenderScore2` so main.ts can update `xMLToCompare`.
 * 2. Calls `callbacks.runDiff()` so SVG overlays and git diff reflect the change.
 * 3. Invalid XML during mid-edit is silently ignored inside rerenderScore2.
 */
export function buildSyncFromMonaco(callbacks: MonacoCallbacks): () => void {
  return debounce(() => {
    if (!monacoDiffEditor) return;
    const xml = monacoDiffEditor.getModifiedEditor().getValue();
    callbacks.rerenderScore2(xml);
    callbacks.runDiff();
  }, 600);
}

// ─── Main render ─────────────────────────────────────────────────────────────

/**
 * Mount or update the Monaco side-by-side diff editor.
 *
 * Receives the resolved `monaco` namespace so this module stays import-free
 * from monaco-editor at the top level — the dynamic import is owned by
 * `monaco-lazy.ts`.
 *
 * **First call** — creates the editor, sets the initial models, and wires up
 * the content-change listener so edits propagate back via the debounced sync.
 *
 * **Subsequent calls** — only updates visual options (line numbers, theme).
 * Models are left untouched so user edits are not lost when settings change.
 */
export function renderCodeDiffPage(
  monaco: typeof Monaco,
  originalXML: string | null,
  xMLToCompare: string | null,
  container: HTMLElement,
  settings: DiffSettingsValue,
  callbacks: MonacoCallbacks,
  getOverlayRecords?: () => readonly OverlayRecord[],
): void {
  if (!originalXML || !xMLToCompare) return;

  if (!monacoDiffEditor) {
    monacoDiffEditor = monaco.editor.createDiffEditor(container, {
      renderSideBySide: true,
      originalEditable: false,
      readOnly: true,
      automaticLayout: true,
      scrollBeyondLastLine: false,
      lineNumbers: settings.showLineNumbers ? "on" : "off",
      minimap: { enabled: settings.showMiniMap },
      wordWrap: "on",
      theme: getMonacoTheme(),
      fontSize: 13,
      useShadowDOM: true,
      smoothScrolling: true,
      showDeprecated: true,
    });

    monacoDiffEditor.setModel({
      original: monaco.editor.createModel(originalXML, "xml"),
      modified: monaco.editor.createModel(xMLToCompare, "xml"),
    });

    // lineNumbers must also be applied to each pane directly on first mount
    const initialPaneOpts = {
      lineNumbers: settings.showLineNumbers ? ("on" as const) : ("off" as const),
      minimap: { enabled: settings.showMiniMap },
    };
    monacoDiffEditor.getOriginalEditor().updateOptions(initialPaneOpts);
    monacoDiffEditor.getModifiedEditor().updateOptions(initialPaneOpts);

    const syncFromMonaco = buildSyncFromMonaco(callbacks);
    monacoDiffEditor.getModel()?.modified.onDidChangeContent(syncFromMonaco);

    // Wire bidirectional hover link now that the editor exists.
    hoverHighlighter = createMonacoHighlighter(monacoDiffEditor);
    if (getOverlayRecords) {
      disposeMonacoToOverlay?.();
      disposeMonacoToOverlay = wireMonacoToOverlay(monacoDiffEditor, getOverlayRecords);
    }
  } else {
    // Preserve user edits — only update appearance options.
    // lineNumbers must be set on each pane individually; the diff editor's
    // updateOptions does not propagate it to the child editors.
    const paneOpts = {
      lineNumbers: settings.showLineNumbers ? ("on" as const) : ("off" as const),
      minimap: { enabled: settings.showMiniMap },
    };
    monacoDiffEditor.getOriginalEditor().updateOptions(paneOpts);
    monacoDiffEditor.getModifiedEditor().updateOptions(paneOpts);
    monaco.editor.setTheme(getMonacoTheme());
  }
}
