/**
 * Wire a notation-stage element to accept drag-and-drop file uploads.
 *
 * Behaviour:
 *  - At rest, the overlay is visually hidden and `pointer-events: none` so
 *    score-overlay interactions are unaffected.
 *  - On `dragenter` / `dragover` the stage gets `.file-drop--active`,
 *    revealing the overlay so the user sees a drop target.
 *  - On `drop`, the first file is forwarded via a `score-file-drop`
 *    CustomEvent. The host wires that to the existing reload pipeline.
 *  - The overlay also doubles as a keyboard-reachable picker trigger — Tab
 *    moves focus onto it, Enter/Space opens a native file dialog. The
 *    existing `<score-loader>` "Choose XML file" row remains the mouse
 *    click-pick affordance.
 *
 * Returns a teardown function the caller can call on unmount.
 */

import { SCORE_FILE_ACCEPT } from "@/utils/loadScoreFile";

/** Detail payload of the `score-file-drop` event. */
export type ScoreFileDropDetail = { file: File };

const ACTIVE_CLASS = "file-drop--active";

/**
 * Attach drop-zone behaviour to a notation stage. The overlay is inserted
 * as a child of `stage`; CSS in style.css controls visibility.
 *
 * @param stage     The `.notation-stage` element to enrich.
 * @param slotLabel Display label for screen readers, e.g. `"score 1"`.
 */
export function wireFileDrop(stage: HTMLElement, slotLabel: string): () => void {
  const overlay = document.createElement("div");
  overlay.className = "file-drop-overlay";
  overlay.setAttribute("role", "button");
  overlay.tabIndex = 0;
  overlay.setAttribute(
    "aria-label",
    `Upload ${slotLabel}: drop a MusicXML file or press Enter to choose one`,
  );
  overlay.innerHTML = `
    <div class="file-drop-message">
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"
           fill="none" stroke="currentColor" stroke-width="1.5"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="17 8 12 3 7 8"></polyline>
        <line x1="12" y1="3" x2="12" y2="15"></line>
      </svg>
      <span>Drop file or press Enter to upload</span>
      <span class="file-drop-hint">.xml &middot; .musicxml &middot; .mxl</span>
    </div>
  `;

  // Hidden file input the overlay opens on keyboard activation.
  const input = document.createElement("input");
  input.type = "file";
  input.accept = SCORE_FILE_ACCEPT;
  input.style.display = "none";
  stage.appendChild(input);

  function emitFile(file: File): void {
    stage.dispatchEvent(
      new CustomEvent<ScoreFileDropDetail>("score-file-drop", {
        detail: { file },
        bubbles: true,
        composed: true,
      }),
    );
  }

  // ── Drag listeners (preventDefault is what enables drop) ────────────────
  const onDragEnter = (e: DragEvent): void => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    stage.classList.add(ACTIVE_CLASS);
  };
  const onDragOver = (e: DragEvent): void => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    stage.classList.add(ACTIVE_CLASS);
  };
  const onDragLeave = (e: DragEvent): void => {
    // Only clear when leaving the stage entirely, not when crossing children.
    if (!stage.contains(e.relatedTarget as Node | null)) {
      stage.classList.remove(ACTIVE_CLASS);
    }
  };
  const onDrop = (e: DragEvent): void => {
    e.preventDefault();
    stage.classList.remove(ACTIVE_CLASS);
    const file = e.dataTransfer?.files?.[0];
    if (file) emitFile(file);
  };

  // ── Keyboard / focus picker ─────────────────────────────────────────────
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      input.click();
    }
  };
  // Show the overlay while focused so keyboard users see it.
  const onFocus = (): void => stage.classList.add(ACTIVE_CLASS);
  const onBlur = (): void => stage.classList.remove(ACTIVE_CLASS);
  const onInputChange = (): void => {
    const file = input.files?.[0];
    if (file) emitFile(file);
    input.value = "";
  };

  stage.addEventListener("dragenter", onDragEnter);
  stage.addEventListener("dragover", onDragOver);
  stage.addEventListener("dragleave", onDragLeave);
  stage.addEventListener("drop", onDrop);
  overlay.addEventListener("keydown", onKeyDown);
  overlay.addEventListener("focus", onFocus);
  overlay.addEventListener("blur", onBlur);
  input.addEventListener("change", onInputChange);

  stage.appendChild(overlay);

  return () => {
    stage.removeEventListener("dragenter", onDragEnter);
    stage.removeEventListener("dragover", onDragOver);
    stage.removeEventListener("dragleave", onDragLeave);
    stage.removeEventListener("drop", onDrop);
    overlay.removeEventListener("keydown", onKeyDown);
    overlay.removeEventListener("focus", onFocus);
    overlay.removeEventListener("blur", onBlur);
    input.removeEventListener("change", onInputChange);
    overlay.remove();
    input.remove();
  };
}
