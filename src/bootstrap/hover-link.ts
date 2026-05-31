/**
 * Bidirectional hover linkage between diff overlays and Monaco editor lines.
 *
 * Two directions:
 *   Overlay → Monaco: mouseenter/focus on an overlay decorates the
 *   corresponding line range in the Monaco diff editor.
 *
 *   Monaco → Overlay: onMouseMove on each Monaco pane resolves the hovered
 *   line to a diff entry and toggles .diff-overlay--hover-link on the matching
 *   overlay element(s).
 *
 * State is cleaned up whenever the caller invokes clearHoverLink(), which
 * should be called before applyDiffHighlights re-runs (overlays are replaced
 * from scratch each render).
 */

import type * as monaco from "monaco-editor";
import type { ElementDiff } from "@/utils/diffXML";

/** CSS class applied to an overlay that is being pointed at from Monaco. */
export const HOVER_LINK_CLASS = "diff-overlay--hover-link";

/** CSS class applied to a Monaco line decoration triggered by an overlay hover. */
export const MONACO_HOVER_CLASS = "diff-line--hover-link";

// ─── Line range computation ───────────────────────────────────────────────────

/**
 * Compute the line range covered by an ElementDiff on a specific side.
 *
 * For "remove" diffs the old-file line numbers are authoritative; for "add"
 * diffs the new-file line numbers are; for "change" diffs both sides are
 * populated but the caller supplies which set to use via `side`.
 *
 * Returns `null` when the diff has no lines at all (can happen on pathological
 * empty diffs — guarding here avoids a Monaco range error with start > end).
 */
export function lineRangeFor(
  diff: ElementDiff,
  side: "original" | "modified",
): { startLineNumber: number; endLineNumber: number } | null {
  const nums: number[] = [];

  for (const l of diff.lines) {
    if (side === "original") {
      // oldLineNo is present on "remove" and "context" lines
      if (l.oldLineNo != null) nums.push(l.oldLineNo);
    } else {
      // newLineNo is present on "add" and "context" lines
      if (l.newLineNo != null) nums.push(l.newLineNo);
    }
  }

  if (nums.length === 0) return null;
  return { startLineNumber: Math.min(...nums), endLineNumber: Math.max(...nums) };
}

// ─── Overlay registry ─────────────────────────────────────────────────────────

/**
 * A flat, ordered record of every rendered overlay and its associated diff.
 * Rebuilt on each applyDiffHighlights call. Keyed by diff.label (unique per
 * rendered overlay — same label may appear in both containers, but for the
 * Monaco direction we just want all overlays that match a label).
 */
export interface OverlayRecord {
  overlay: HTMLDivElement;
  diff: ElementDiff;
}

// ─── Monaco highlight (overlay → Monaco) ─────────────────────────────────────

/**
 * Manages the single decoration collection used for overlay-triggered Monaco
 * highlights. `set([])` / `clear()` are idempotent so callers never need to
 * track whether a decoration is active.
 */
export interface MonacoHighlighter {
  /** Highlight a line range in the appropriate Monaco pane. Clears any prior decoration. */
  highlight(diff: ElementDiff): void;
  /** Remove any active decoration. */
  clear(): void;
  /** Drop decoration collections — call when the editor is torn down. */
  dispose(): void;
}

export function createMonacoHighlighter(
  editor: monaco.editor.IStandaloneDiffEditor,
): MonacoHighlighter {
  // One decoration collection per pane — Monaco owns the lifecycle and clears
  // entries automatically when the model is replaced.
  const origColl = editor.getOriginalEditor().createDecorationsCollection();
  const modColl = editor.getModifiedEditor().createDecorationsCollection();

  const DECORATION: Omit<monaco.editor.IModelDeltaDecoration, "range"> = {
    options: {
      className: MONACO_HOVER_CLASS,
      isWholeLine: true,
    },
  };

  return {
    highlight(diff: ElementDiff): void {
      // Determine which pane owns this diff
      const isOriginal = diff.changeType === "remove";
      const side = isOriginal ? "original" : "modified";
      const range = lineRangeFor(diff, side);

      // Always clear both so a rapid direction change doesn't leave stale marks
      origColl.clear();
      modColl.clear();

      if (!range) return;

      const decoration: monaco.editor.IModelDeltaDecoration = {
        range: {
          startLineNumber: range.startLineNumber,
          endLineNumber: range.endLineNumber,
          startColumn: 1,
          endColumn: 1,
        },
        ...DECORATION,
      };

      if (isOriginal) {
        origColl.set([decoration]);
      } else {
        modColl.set([decoration]);
      }
    },

    clear(): void {
      origColl.clear();
      modColl.clear();
    },

    dispose(): void {
      origColl.clear();
      modColl.clear();
    },
  };
}

// ─── Monaco → overlay direction ───────────────────────────────────────────────

/**
 * Build a lookup structure from line number → OverlayRecord for one Monaco
 * pane. Rebuilding on each applyDiffHighlights call is cheap (linear scan of
 * the overlay list, which is typically < 200 entries for real scores).
 *
 * The returned function resolves a line number to every overlay whose diff
 * covers that line on the given side.
 */
export function buildLineToOverlayLookup(
  records: readonly OverlayRecord[],
  side: "original" | "modified",
): (lineNumber: number) => OverlayRecord[] {
  // Map from line number → list of records covering that line.
  const index = new Map<number, OverlayRecord[]>();

  for (const record of records) {
    const range = lineRangeFor(record.diff, side);
    if (!range) continue;
    for (let ln = range.startLineNumber; ln <= range.endLineNumber; ln++) {
      let bucket = index.get(ln);
      if (!bucket) {
        bucket = [];
        index.set(ln, bucket);
      }
      bucket.push(record);
    }
  }

  return (lineNumber: number) => index.get(lineNumber) ?? [];
}

// ─── Wiring helpers ───────────────────────────────────────────────────────────

/**
 * Install a throttled onMouseMove listener on `editor` that toggles
 * HOVER_LINK_CLASS on matching overlay elements.
 *
 * Returns a disposal function — call it before replacing the overlay set or
 * tearing down the editor.
 */
export function wireMonacoToOverlay(
  editor: monaco.editor.IStandaloneDiffEditor,
  getRecords: () => readonly OverlayRecord[],
): () => void {
  // Currently highlighted overlay elements — tracked so we can clear them
  // before applying the next hover without a full DOM scan.
  let activeOverlays: HTMLDivElement[] = [];

  function clearActive(): void {
    for (const el of activeOverlays) el.classList.remove(HOVER_LINK_CLASS);
    activeOverlays = [];
  }

  // rAF token — keeps at most one pending frame per pane.
  let rafToken: number | null = null;

  function handleMouseMove(
    side: "original" | "modified",
    e: monaco.editor.IEditorMouseEvent,
  ): void {
    // target.position is only populated for CONTENT_TEXT and CONTENT_EMPTY
    const pos = e.target.position;
    if (!rafToken) {
      rafToken = requestAnimationFrame(() => {
        rafToken = null;
        clearActive();
        if (!pos) return;
        const lookup = buildLineToOverlayLookup(getRecords(), side);
        const hits = lookup(pos.lineNumber);
        for (const { overlay } of hits) {
          overlay.classList.add(HOVER_LINK_CLASS);
          activeOverlays.push(overlay);
        }
      });
    }
  }

  function handleMouseLeave(): void {
    if (rafToken) {
      cancelAnimationFrame(rafToken);
      rafToken = null;
    }
    clearActive();
  }

  const origEditor = editor.getOriginalEditor();
  const modEditor = editor.getModifiedEditor();

  const d1 = origEditor.onMouseMove((e) => handleMouseMove("original", e));
  const d2 = modEditor.onMouseMove((e) => handleMouseMove("modified", e));
  // Clear on mouse-leave from either pane
  const d3 = origEditor.onMouseLeave(handleMouseLeave);
  const d4 = modEditor.onMouseLeave(handleMouseLeave);

  return () => {
    if (rafToken) cancelAnimationFrame(rafToken);
    clearActive();
    d1.dispose();
    d2.dispose();
    d3.dispose();
    d4.dispose();
  };
}

/**
 * Wire overlay hover and focus events to the Monaco highlighter.
 *
 * This attaches mouseenter/mouseleave/focus/blur listeners to every overlay
 * element. Existing listeners on the overlay (tooltip, click) are preserved.
 *
 * Returns a disposal function that removes the added listeners and clears any
 * active Monaco decoration.  Called before the overlay set is replaced.
 */
export function wireOverlayToMonaco(
  records: readonly OverlayRecord[],
  highlighter: MonacoHighlighter,
): () => void {
  type ListenerEntry = {
    overlay: HTMLDivElement;
    type: string;
    handler: EventListenerOrEventListenerObject;
  };
  const attached: ListenerEntry[] = [];

  for (const { overlay, diff } of records) {
    const enter = (): void => highlighter.highlight(diff);
    const leave = (): void => highlighter.clear();

    // { passive: true } — we never call preventDefault on these events
    overlay.addEventListener("mouseenter", enter, { passive: true });
    overlay.addEventListener("mouseleave", leave, { passive: true });
    overlay.addEventListener("focus", enter, { passive: true });
    overlay.addEventListener("blur", leave, { passive: true });

    attached.push(
      { overlay, type: "mouseenter", handler: enter },
      { overlay, type: "mouseleave", handler: leave },
      { overlay, type: "focus", handler: enter },
      { overlay, type: "blur", handler: leave },
    );
  }

  return () => {
    for (const { overlay, type, handler } of attached) {
      overlay.removeEventListener(type, handler);
    }
    highlighter.clear();
  };
}
