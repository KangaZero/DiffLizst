/**
 * Bidirectional proportional scroll synchronisation between two notation panes.
 *
 * WHY proportional rather than pixel-for-pixel: the two panes can be rendered
 * at different scales (e.g. 100 vs 50), making their scrollable widths
 * unequal. Proportional sync keeps both panes at the same relative position
 * within their own content regardless of absolute dimensions.
 *
 * WHY the suppress flag + double rAF: when we programmatically set
 * target.scrollLeft/Top it fires a synthetic scroll event on the target,
 * which would call onScroll(target, source), which would set source's scroll,
 * and so on. The suppress flag breaks the cycle. The second rAF releases the
 * flag only after the browser has processed the synthetic scroll event.
 */
export function wireScrollSync(a: HTMLElement, b: HTMLElement): () => void {
  let suppress = false;

  function onScroll(
    source: HTMLElement,
    target: HTMLElement,
    pending: { value: boolean },
  ): () => void {
    return () => {
      if (suppress) return;
      if (source.dataset.scrollSync === "off" || target.dataset.scrollSync === "off") return;
      if (pending.value) return;

      pending.value = true;
      requestAnimationFrame(() => {
        pending.value = false;

        if (source.dataset.scrollSync === "off" || target.dataset.scrollSync === "off") return;

        // Compute the scroll fraction for each axis. When there is no
        // scrollable range (scrollWidth === clientWidth) the fraction is 0 so
        // the target stays at 0 — avoids NaN from 0/0.
        const xScrollable = source.scrollWidth - source.clientWidth;
        const yScrollable = source.scrollHeight - source.clientHeight;

        const xRatio = xScrollable > 0 ? source.scrollLeft / xScrollable : 0;
        const yRatio = yScrollable > 0 ? source.scrollTop / yScrollable : 0;

        suppress = true;
        target.scrollLeft = xRatio * (target.scrollWidth - target.clientWidth);
        target.scrollTop = yRatio * (target.scrollHeight - target.clientHeight);

        // Release after the browser processes the scroll events we just
        // triggered, so reflex events don't bounce back to the source.
        requestAnimationFrame(() => {
          suppress = false;
        });
      });
    };
  }

  // Each direction gets its own pending ref so A→B and B→A don't block each other.
  const onA = onScroll(a, b, { value: false });
  const onB = onScroll(b, a, { value: false });

  a.addEventListener("scroll", onA, { passive: true });
  b.addEventListener("scroll", onB, { passive: true });

  return () => {
    a.removeEventListener("scroll", onA);
    b.removeEventListener("scroll", onB);
  };
}
