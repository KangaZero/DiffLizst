import type { ElementDiff, XMLDiffResult } from './diffXML';

let tooltipEl: HTMLDivElement | null = null;

function getTooltip(): HTMLDivElement {
  if (tooltipEl) return tooltipEl;
  tooltipEl = document.createElement('div');
  tooltipEl.id = 'diff-tooltip';
  tooltipEl.setAttribute('aria-hidden', 'true');
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}

function buildTooltipHTML(diff: ElementDiff): string {
  const header = `<span class="diff-tooltip-header">@@ ${diff.label} @@</span>`;
  const body = diff.lines.map(l => {
    const prefix = l.type === 'add' ? '+' : l.type === 'remove' ? '-' : ' ';
    const cls = `diff-line-${l.type}`;
    const escaped = l.content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<span class="${cls}">${prefix}${escaped}</span>`;
  }).join('');
  return `${header}<code class="diff-tooltip-body">${body}</code>`;
}

function positionTooltip(tooltip: HTMLDivElement, e: MouseEvent): void {
  const gap = 14;
  const tipWidth = tooltip.offsetWidth || 320;
  const tipHeight = tooltip.offsetHeight || 200;
  let x = e.clientX + gap;
  let y = e.clientY + gap;
  if (x + tipWidth > window.innerWidth) x = e.clientX - tipWidth - gap;
  if (y + tipHeight > window.innerHeight) y = e.clientY - tipHeight - gap;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

function createOverlay(
  targetEl: Element,
  container: HTMLElement,
  diff: ElementDiff,
): HTMLDivElement {
  const tooltip = getTooltip();
  const html = buildTooltipHTML(diff);

  const overlay = document.createElement('div');
  overlay.className = `diff-overlay diff-overlay--${diff.changeType}`;

  const containerRect = container.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();

  overlay.style.left = `${targetRect.left - containerRect.left + container.scrollLeft}px`;
  overlay.style.top = `${targetRect.top - containerRect.top + container.scrollTop}px`;
  overlay.style.width = `${targetRect.width}px`;
  overlay.style.height = `${targetRect.height}px`;

  overlay.addEventListener('mouseenter', e => {
    tooltip.innerHTML = html;
    tooltip.classList.add('diff-tooltip--visible');
    positionTooltip(tooltip, e);
  });
  overlay.addEventListener('mousemove', e => positionTooltip(tooltip, e));
  overlay.addEventListener('mouseleave', () => {
    tooltip.classList.remove('diff-tooltip--visible');
  });

  return overlay;
}

export function applyDiffHighlights(
  container1: HTMLElement,
  container2: HTMLElement,
  diff: XMLDiffResult,
): void {
  [container1, container2].forEach(c => {
    c.querySelectorAll('.diff-overlay').forEach(el => el.remove());
  });

  const svgMeasures1 = container1.querySelectorAll<SVGGElement>('g.measure');
  const svgMeasures2 = container2.querySelectorAll<SVGGElement>('g.measure');

  for (const [num, d] of [...diff.measures.entries()].sort(([a], [b]) => a - b)) {
    const idx = num - 1; // measure number is 1-based
    const m1 = svgMeasures1[idx];
    const m2 = svgMeasures2[idx];

    if (m1 && (d.changeType === 'change' || d.changeType === 'remove')) {
      container1.appendChild(createOverlay(m1, container1, d));
    }
    if (m2 && (d.changeType === 'change' || d.changeType === 'add')) {
      container2.appendChild(createOverlay(m2, container2, d));
    }
  }

  const pgHead1 = container1.querySelector('g.pgHead');
  const pgHead2 = container2.querySelector('g.pgHead');
  const texts1 = pgHead1 ? Array.from(pgHead1.querySelectorAll<SVGTextElement>('text')) : [];
  const texts2 = pgHead2 ? Array.from(pgHead2.querySelectorAll<SVGTextElement>('text')) : [];

  for (const [idx, d] of diff.credits.entries()) {
    const t1 = texts1[idx];
    const t2 = texts2[idx];

    if (t1 && (d.changeType === 'change' || d.changeType === 'remove')) {
      container1.appendChild(createOverlay(t1, container1, d));
    }
    if (t2 && (d.changeType === 'change' || d.changeType === 'add')) {
      container2.appendChild(createOverlay(t2, container2, d));
    }
  }
}
