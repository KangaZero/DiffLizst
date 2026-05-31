/**
 * `<annotation-manager>` Web Component
 *
 * Manages annotation markers on notation stages and a popover for adding,
 * viewing, and deleting per-measure notes.
 *
 * Usage:
 *   const mgr = new AnnotationManager();
 *   mgr.diffKey = 'Chopin-A|Chopin-B';
 *   document.body.appendChild(mgr);
 *   // After each diff re-render:
 *   mgr.refresh(containers);
 *
 * The component renders annotation markers directly into the host document
 * (not into its own Shadow DOM) so markers sit on top of the `.notation-stage`
 * elements alongside existing `.diff-overlay` nodes. The popover is rendered
 * into the Shadow DOM for style isolation and focus-trap containment.
 */

import {
  type Annotation,
  deleteAnnotation,
  diffKeyFor,
  loadAnnotations,
  saveAnnotation,
} from "@/utils/annotations";

export type { Annotation };
export { diffKeyFor };

const MARKER_CLASS = "annotation-marker";
const MARKER_DATA_ATTR = "annotationMeasure";

const POPOVER_STYLES = `
:host { display: contents; }

.popover {
  position: fixed;
  inset: 0;
  z-index: 400;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.35);
}

.popover[hidden] { display: none; }

.popover-panel {
  background: var(--bg, #fff);
  border: 1px solid var(--border, #e5e4e7);
  border-radius: var(--radius-md, 8px);
  box-shadow: var(--shadow, 0 10px 15px -3px rgba(0,0,0,0.1));
  padding: 20px;
  min-width: 300px;
  max-width: 480px;
  width: 90vw;
  max-height: 80vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.popover-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-h, #08060d);
}

.annotation-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.annotation-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--border, #e5e4e7);
  border-radius: var(--radius-sm, 4px);
  font-size: 13px;
}

.annotation-item-text {
  flex: 1;
  word-break: break-word;
  color: var(--text-h, #08060d);
  white-space: pre-wrap;
}

.annotation-meta {
  font-size: 11px;
  color: var(--text-muted, #767083);
  white-space: nowrap;
}

.btn-delete {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--border, #e5e4e7);
  border-radius: var(--radius-sm, 4px);
  background: transparent;
  color: var(--color-danger, #dc2626);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-delete:hover { background: var(--color-error-bg, rgba(220,38,38,0.1)); }
.btn-delete:focus-visible { outline: 2px solid var(--accent, #9b35f5); outline-offset: 2px; }

.add-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid var(--border, #e5e4e7);
  padding-top: 12px;
}

.add-form-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text, #6b6375);
}

.add-form-textarea {
  width: 100%;
  min-height: 72px;
  padding: 8px;
  border: 1px solid var(--border, #e5e4e7);
  border-radius: var(--radius-sm, 4px);
  background: var(--bg, #fff);
  color: var(--text-h, #08060d);
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  box-sizing: border-box;
}

.add-form-textarea:focus-visible {
  outline: 2px solid var(--accent, #9b35f5);
  outline-offset: -1px;
}

.form-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.btn-primary {
  padding: 6px 14px;
  border: none;
  border-radius: var(--radius-sm, 4px);
  background: var(--accent, #9b35f5);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.btn-primary:hover { filter: brightness(1.1); }
.btn-primary:focus-visible { outline: 2px solid var(--accent, #9b35f5); outline-offset: 2px; }

.btn-secondary {
  padding: 6px 14px;
  border: 1px solid var(--border, #e5e4e7);
  border-radius: var(--radius-sm, 4px);
  background: transparent;
  color: var(--text-h, #08060d);
  font-size: 13px;
  cursor: pointer;
}

.btn-secondary:hover { background: var(--accent-bg, rgba(155,53,245,0.1)); }
.btn-secondary:focus-visible { outline: 2px solid var(--accent, #9b35f5); outline-offset: 2px; }

.empty-note {
  font-size: 12px;
  color: var(--text-muted, #767083);
  font-style: italic;
}
`;

export class AnnotationManager extends HTMLElement {
  #diffKey = "";
  #openerEl: Element | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  get diffKey(): string {
    return this.#diffKey;
  }

  set diffKey(value: string) {
    this.#diffKey = value;
  }

  connectedCallback(): void {
    this.#renderShadow();
    this.#wirePopoverClose();
  }

  disconnectedCallback(): void {
    this.#removeMarkers();
  }

  /**
   * Re-attach annotation markers after every diff re-render.
   * Call this after `applyDiffHighlights` completes.
   */
  refresh(containers: readonly HTMLElement[]): void {
    this.#removeMarkers();
    if (!this.#diffKey) return;

    const annotations = loadAnnotations(this.#diffKey);
    if (annotations.length === 0) return;

    const byMeasure = new Map<number, Annotation[]>();
    for (const ann of annotations) {
      const list = byMeasure.get(ann.measure) ?? [];
      list.push(ann);
      byMeasure.set(ann.measure, list);
    }

    for (const container of containers) {
      for (const [measure, anns] of byMeasure) {
        this.#attachMarker(container, measure, anns);
      }
    }
  }

  #renderShadow(): void {
    const shadow = this.shadowRoot!;
    shadow.innerHTML = `
      <style>${POPOVER_STYLES}</style>
      <div class="popover" role="dialog" aria-modal="true" aria-label="Measure annotation" hidden>
        <div class="popover-panel">
          <p class="popover-title"></p>
          <ul class="annotation-list" aria-label="Existing annotations"></ul>
          <div class="add-form">
            <label class="add-form-label" for="ann-textarea">Add note</label>
            <textarea id="ann-textarea" class="add-form-textarea" placeholder="Enter your note…" rows="3"></textarea>
            <div class="form-actions">
              <button type="button" class="btn-secondary" id="ann-cancel">Cancel</button>
              <button type="button" class="btn-primary" id="ann-save">Save</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  #wirePopoverClose(): void {
    const shadow = this.shadowRoot!;
    const popover = shadow.querySelector<HTMLElement>(".popover")!;

    shadow.querySelector("#ann-cancel")?.addEventListener("click", () => this.#closePopover());
    shadow.querySelector("#ann-save")?.addEventListener("click", () => this.#handleSave());

    popover.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Escape") this.#closePopover();
      if (e.key === "Tab") this.#trapFocus(e);
    });

    // Click on backdrop (not the panel) closes the popover.
    popover.addEventListener("click", (e: MouseEvent) => {
      if (e.target === popover) this.#closePopover();
    });
  }

  #trapFocus(e: KeyboardEvent): void {
    const shadow = this.shadowRoot!;
    const focusable = Array.from(
      shadow.querySelectorAll<HTMLElement>('button, textarea, [tabindex]:not([tabindex="-1"])'),
    ).filter((el) => !el.hidden && el.offsetParent !== null);

    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  #attachMarker(container: HTMLElement, measure: number, annotations: Annotation[]): void {
    // Find the measure overlay or the measure SVG group to anchor the marker.
    const overlayCandidate = container.querySelector<HTMLElement>(
      `[data-diff-measure="${measure}"]`,
    );

    const anchor = overlayCandidate ?? this.#findMeasureGroup(container, measure);
    if (!anchor) return;

    const stage = container.closest<HTMLElement>(".notation-stage") ?? container;
    const stageRect = stage.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();

    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = MARKER_CLASS;
    marker.dataset[MARKER_DATA_ATTR] = String(measure);
    marker.setAttribute(
      "aria-label",
      `${annotations.length} annotation${annotations.length === 1 ? "" : "s"} on measure ${measure}. Click to view.`,
    );
    marker.title = `${annotations.length} annotation${annotations.length === 1 ? "" : "s"} on measure ${measure}`;

    const scrollTop = stage.scrollTop ?? 0;
    const scrollLeft = stage.scrollLeft ?? 0;
    const offsetTop = anchorRect.top - stageRect.top + scrollTop;
    const offsetLeft = anchorRect.left - stageRect.left + scrollLeft;

    marker.style.cssText = `position:absolute;top:${offsetTop}px;left:${offsetLeft + anchorRect.width - 16}px;z-index:var(--z-overlay,200);`;

    marker.addEventListener("click", (e) => {
      e.stopPropagation();
      this.#openPopover(measure, marker);
    });

    stage.style.position = stage.style.position || "relative";
    stage.appendChild(marker);
  }

  #findMeasureGroup(container: HTMLElement, measure: number): Element | null {
    // Verovio SVG: g.measure elements have a data-n or number attribute.
    const candidates = container.querySelectorAll<SVGGElement>("g.measure");
    for (const g of candidates) {
      const n = g.getAttribute("data-n") ?? g.getAttribute("n");
      if (n !== null && Number(n) === measure) return g;
    }
    return null;
  }

  #openPopover(measure: number, opener: Element): void {
    this.#openerEl = opener;
    const shadow = this.shadowRoot!;
    const popover = shadow.querySelector<HTMLElement>(".popover")!;
    const title = shadow.querySelector<HTMLElement>(".popover-title")!;
    const list = shadow.querySelector<HTMLUListElement>(".annotation-list")!;
    const textarea = shadow.querySelector<HTMLTextAreaElement>("#ann-textarea")!;

    title.textContent = `Measure ${measure} — annotations`;
    textarea.value = "";
    textarea.dataset.measure = String(measure);

    this.#renderAnnotationList(list, measure);

    popover.hidden = false;
    textarea.focus();
  }

  #closePopover(): void {
    const shadow = this.shadowRoot!;
    shadow.querySelector<HTMLElement>(".popover")!.hidden = true;
    if (this.#openerEl instanceof HTMLElement) this.#openerEl.focus();
    this.#openerEl = null;
  }

  #renderAnnotationList(list: HTMLUListElement, measure: number): void {
    list.innerHTML = "";
    const annotations = loadAnnotations(this.#diffKey).filter((a) => a.measure === measure);

    if (annotations.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty-note";
      empty.textContent = "No annotations yet.";
      list.appendChild(empty);
      return;
    }

    for (const ann of annotations) {
      const li = document.createElement("li");
      li.className = "annotation-item";

      const text = document.createElement("span");
      text.className = "annotation-item-text";
      text.textContent = ann.text;

      const meta = document.createElement("span");
      meta.className = "annotation-meta";
      meta.textContent = new Date(ann.createdAt).toLocaleDateString();

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "btn-delete";
      delBtn.setAttribute("aria-label", `Delete annotation: ${ann.text.slice(0, 30)}`);
      delBtn.textContent = "×";
      delBtn.addEventListener("click", () => {
        deleteAnnotation(ann.id);
        this.#renderAnnotationList(list, measure);
        this.#emitChange();
      });

      li.appendChild(text);
      li.appendChild(meta);
      li.appendChild(delBtn);
      list.appendChild(li);
    }
  }

  #handleSave(): void {
    const shadow = this.shadowRoot!;
    const textarea = shadow.querySelector<HTMLTextAreaElement>("#ann-textarea")!;
    const list = shadow.querySelector<HTMLUListElement>(".annotation-list")!;
    const measure = Number(textarea.dataset.measure ?? "0");
    const rawText = textarea.value.trim();

    if (!rawText || !measure) return;

    const annotation: Annotation = {
      id: crypto.randomUUID(),
      diffKey: this.#diffKey,
      measure,
      text: rawText,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    saveAnnotation(annotation);
    textarea.value = "";
    this.#renderAnnotationList(list, measure);
    this.#emitChange();
  }

  #emitChange(): void {
    this.dispatchEvent(new CustomEvent("annotations-change", { bubbles: true, composed: true }));
  }

  #removeMarkers(): void {
    for (const el of document.querySelectorAll(`.${MARKER_CLASS}`)) {
      el.remove();
    }
  }

  /**
   * Open the add-annotation popover for a given measure from an external trigger
   * (e.g. the "+" button in the diff summary sidebar).
   */
  openForMeasure(measure: number, opener: Element): void {
    this.#openPopover(measure, opener);
  }
}

customElements.define("annotation-manager", AnnotationManager);
