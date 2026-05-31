/**
 * Drag-resizable splitter between the two notation panes.
 *
 * Drives layout via CSS custom properties on the flex container rather than
 * direct element width mutations — keeps layout calculation in one place
 * (the stylesheet) and avoids layout thrash on every pointermove.
 *
 * The ratio (0..1) represents pane-1's fractional share of the combined
 * pane width. 0.5 → equal split. Persisted to localStorage.
 */

const STORAGE_KEY = "difflizst.splitter.ratio";
const MIN_PX = 240;
const DEFAULT_RATIO = 0.5;
const SMALL_STEP_PX = 10;
const LARGE_STEP_PX = 50;
const MOBILE_BREAKPOINT_PX = 900;

export interface SplitterRefs {
  container: HTMLElement;
  splitter: HTMLElement;
}

function clampRatio(ratio: number, containerWidth: number): number {
  const minRatio = MIN_PX / containerWidth;
  const maxRatio = 1 - minRatio;
  return Math.min(Math.max(ratio, minRatio), maxRatio);
}

function applyRatio(container: HTMLElement, ratio: number): void {
  container.style.setProperty("--notation-pane-1-flex", String(ratio));
  container.style.setProperty("--notation-pane-2-flex", String(1 - ratio));
}

function saveRatio(ratio: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(ratio));
  } catch {
    // localStorage may be unavailable in sandboxed contexts — fail silently.
  }
}

function loadRatio(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      const parsed = Number(stored);
      if (Number.isFinite(parsed) && parsed > 0 && parsed < 1) return parsed;
    }
  } catch {
    // localStorage unavailable — fall back to default.
  }
  return DEFAULT_RATIO;
}

function isMobileLayout(): boolean {
  return window.innerWidth < MOBILE_BREAKPOINT_PX;
}

export function wireSplitter({ container, splitter }: SplitterRefs): void {
  let currentRatio = loadRatio();
  applyRatio(container, currentRatio);

  let dragging = false;
  let dragStartX = 0;
  let dragStartRatio = DEFAULT_RATIO;

  function getContainerWidth(): number {
    // Exclude the splitter's own width from the available flex space.
    return container.clientWidth - splitter.offsetWidth;
  }

  function onPointerDown(e: PointerEvent): void {
    if (isMobileLayout()) return;
    dragging = true;
    dragStartX = e.clientX;
    dragStartRatio = currentRatio;
    splitter.setPointerCapture(e.pointerId);
    splitter.classList.add("notation-splitter--dragging");
  }

  function onPointerMove(e: PointerEvent): void {
    if (!dragging) return;
    const containerWidth = getContainerWidth();
    if (containerWidth <= 0) return;
    const deltaRatio = (e.clientX - dragStartX) / containerWidth;
    const newRatio = clampRatio(dragStartRatio + deltaRatio, containerWidth);
    currentRatio = newRatio;
    applyRatio(container, newRatio);
  }

  function onPointerUp(e: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    splitter.releasePointerCapture(e.pointerId);
    splitter.classList.remove("notation-splitter--dragging");
    saveRatio(currentRatio);
  }

  function onDoubleClick(): void {
    if (isMobileLayout()) return;
    currentRatio = DEFAULT_RATIO;
    const containerWidth = getContainerWidth();
    applyRatio(container, clampRatio(DEFAULT_RATIO, containerWidth));
    saveRatio(DEFAULT_RATIO);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (isMobileLayout()) return;
    const containerWidth = getContainerWidth();
    if (containerWidth <= 0) return;

    const stepPx = e.shiftKey ? LARGE_STEP_PX : SMALL_STEP_PX;
    const stepRatio = stepPx / containerWidth;

    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        currentRatio = clampRatio(currentRatio - stepRatio, containerWidth);
        applyRatio(container, currentRatio);
        saveRatio(currentRatio);
        break;
      case "ArrowRight":
        e.preventDefault();
        currentRatio = clampRatio(currentRatio + stepRatio, containerWidth);
        applyRatio(container, currentRatio);
        saveRatio(currentRatio);
        break;
      case "Home":
        e.preventDefault();
        currentRatio = clampRatio(0, containerWidth);
        applyRatio(container, currentRatio);
        saveRatio(currentRatio);
        break;
      case "End":
        e.preventDefault();
        currentRatio = clampRatio(1, containerWidth);
        applyRatio(container, currentRatio);
        saveRatio(currentRatio);
        break;
    }
  }

  splitter.addEventListener("pointerdown", onPointerDown);
  splitter.addEventListener("pointermove", onPointerMove);
  splitter.addEventListener("pointerup", onPointerUp);
  splitter.addEventListener("pointercancel", onPointerUp);
  splitter.addEventListener("dblclick", onDoubleClick);
  splitter.addEventListener("keydown", onKeyDown);
}

export { clampRatio, DEFAULT_RATIO, loadRatio, MIN_PX, saveRatio };
