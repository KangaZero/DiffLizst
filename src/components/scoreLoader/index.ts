/**
 * `<score-loader>` Web Component
 *
 * A "Load Score" button that opens a dropdown panel with two options:
 *  1. Pre-bundled sample scores grouped by composer, each group in a closed
 *     accordion by default (native `<details>`/`<summary>`).
 *  2. User-uploaded MusicXML file (`.xml` / `.musicxml`).
 *
 * When the user picks a sample or uploads a file the component dispatches a
 * `score-load` CustomEvent whose `detail` carries the raw XML string and a
 * display filename, so the host can re-render the appropriate score without
 * knowing about files or imports.
 *
 * @fires score-load — Fired when a score is selected or uploaded.
 *   `detail` is a {@link ScoreLoadDetail} object.
 *
 * @example
 * ```html
 * <score-loader id="score-loader-1"></score-loader>
 * ```
 * ```ts
 * const loader = document.querySelector<ScoreLoader>('#score-loader-1')!;
 * loader.samples = [{ id: 'op10-1', composer: 'Chopin', label: 'Étude Op.10 No.1', xml: rawXml }];
 * loader.addEventListener('score-load', (e) => {
 *   const { xml, filename } = (e as CustomEvent<ScoreLoadDetail>).detail;
 *   reloadScore(xml, filename);
 * });
 * ```
 */

export type Composer =
  | "Chopin"
  | "Beethoven"
  | "Mozart"
  | "Bach"
  | "Debussy"
  | "Rachmaninoff"
  | "Schubert"
  | "Liszt"
  | "Tchaikovsky"
  | "Prokofiev"
  | "Stravinsky"
  | "Satie"
  | "Grieg"
  | "Mendelssohn"
  | "Ravel"
  | "Haydn";

/** Branded type to indicate this string should be raw MusicXML content. */
export type MXML = string & { __brand: "musicxml" };

/** One entry in the pre-bundled score list shown inside the dropdown. */
export type ScoreLoaderSample = {
  id: `${Composer}-${string}`;
  composer: Composer;
  label: string;
  xml: MXML;
};

/** Payload dispatched with the `score-load` CustomEvent. */
export type ScoreLoadDetail = {
  xml: string;
  /** Display name – either the sample label or the uploaded file name. */
  filename: string;
};

// ─── Icons (Lucide MIT) ────────────────────────────────────────────────────

const MUSIC_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
  fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M9 18V5l12-2v13"/>
  <circle cx="6" cy="18" r="3"/>
  <circle cx="18" cy="16" r="3"/>
</svg>`;

const UPLOAD_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
  fill="none" stroke="currentColor" stroke-width="2"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
  <polyline points="17 8 12 3 7 8"/>
  <line x1="12" y1="3" x2="12" y2="15"/>
</svg>`;

const CHEVRON_ICON = `<svg class="chevron" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24"
  fill="none" stroke="currentColor" stroke-width="2.5"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="m9 18 6-6-6-6"/>
</svg>`;

// ─── Template ──────────────────────────────────────────────────────────────

const template = document.createElement("template");
template.innerHTML = `
<style>
  :host {
    position: relative;
    display: inline-block;
  }

  .trigger {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 10px;
    border: 1px solid var(--border, #e5e4e7);
    border-radius: var(--radius-md, 8px);
    background: transparent;
    color: var(--text-h, #08060d);
    cursor: pointer;
    font-size: 12px;
    font-family: inherit;
    white-space: nowrap;
    transition: background var(--duration-fast, 0.15s), border-color var(--duration-fast, 0.15s);
  }
  .trigger:hover {
    background: var(--accent-bg, rgba(170,59,255,0.1));
    border-color: var(--accent-border, rgba(170,59,255,0.5));
  }
  .trigger:focus-visible {
    outline: 2px solid var(--accent, #aa3bff);
    outline-offset: 2px;
  }
  .trigger[aria-expanded="true"] {
    background: var(--accent-bg, rgba(170,59,255,0.1));
    border-color: var(--accent-border, rgba(170,59,255,0.5));
  }

  .panel {
    display: none;
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 300;
    min-width: 240px;
    background: var(--code-bg, #f4f3ec);
    border: 1px solid var(--border, #e5e4e7);
    border-radius: var(--radius-md, 8px);
    box-shadow: var(--shadow, rgba(0,0,0,0.1) 0 10px 15px -3px);
    padding: 8px 0;
    overflow: hidden;
  }
  .panel.open {
    display: block;
  }

  .section-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text, #6b6375);
    padding: 4px 14px 6px;
  }

  /* ── Composer accordion ── */

  details {
    border-top: 1px solid var(--border, #e5e4e7);
  }
  details:first-of-type {
    border-top: none;
  }

  summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 14px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.03em;
    color: var(--text, #6b6375);
    list-style: none;
    user-select: none;
    transition: background var(--duration-fast, 0.15s), color var(--duration-fast, 0.15s);
  }
  /* Hide native disclosure triangle in all browsers */
  summary::-webkit-details-marker { display: none; }
  summary::marker { display: none; }

  summary:hover {
    background: var(--accent-bg, rgba(170,59,255,0.07));
    color: var(--text-h, #08060d);
  }
  summary:focus-visible {
    outline: 2px solid var(--accent, #aa3bff);
    outline-offset: -2px;
  }

  .chevron {
    flex-shrink: 0;
    transition: transform var(--duration-fast, 0.15s);
  }
  details[open] > summary .chevron {
    transform: rotate(90deg);
  }

  /* ── Score buttons ── */

  .sample-btn {
    display: flex;
    align-items: center;
    width: 100%;
    text-align: left;
    padding: 6px 14px 6px 24px;
    border: none;
    background: transparent;
    color: var(--text-h, #08060d);
    cursor: pointer;
    font-size: 13px;
    font-family: inherit;
    transition: background var(--duration-fast, 0.15s);
  }
  .sample-btn:hover {
    background: var(--accent-bg, rgba(170,59,255,0.07));
  }
  .sample-btn:focus-visible {
    outline: 2px solid var(--accent, #aa3bff);
    outline-offset: -2px;
  }

  /* ── Divider & upload ── */

  .divider {
    border: none;
    border-top: 1px solid var(--border, #e5e4e7);
    margin: 6px 0;
  }

  .upload-row {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 7px 14px;
    cursor: pointer;
    color: var(--text-h, #08060d);
    font-size: 13px;
    font-family: inherit;
    transition: background var(--duration-fast, 0.15s);
  }
  .upload-row:hover {
    background: var(--accent-bg, rgba(170,59,255,0.07));
  }

  input[type="file"] {
    display: none;
  }
</style>

<button class="trigger" type="button" aria-haspopup="true" aria-expanded="false">
  ${MUSIC_ICON}
  Load Score
</button>

<div class="panel" role="dialog" aria-label="Score selection">
<div class="section-label">Upload</div>
  <label class="upload-row">
    ${UPLOAD_ICON}
    Choose XML file…
    <input type="file" accept=".xml,.musicxml" />
  </label>

  <hr class="divider" />

  <div class="section-label">Sample Scores</div>
  <div class="samples-list"></div>
  
</div>
`;

// ─── Element class ──────────────────────────────────────────────────────────

export class ScoreLoader extends HTMLElement {
  readonly #shadow: ShadowRoot;
  #samples: ScoreLoaderSample[] = [];
  #open = false;

  readonly #triggerBtn: HTMLButtonElement;
  readonly #panel: HTMLDivElement;
  readonly #samplesList: HTMLDivElement;
  readonly #fileInput: HTMLInputElement;

  constructor() {
    super();
    this.#shadow = this.attachShadow({ mode: "open" });
    this.#shadow.appendChild(template.content.cloneNode(true));

    this.#triggerBtn =
      this.#shadow.querySelector<HTMLButtonElement>(".trigger")!;
    this.#panel = this.#shadow.querySelector<HTMLDivElement>(".panel")!;
    this.#samplesList =
      this.#shadow.querySelector<HTMLDivElement>(".samples-list")!;
    this.#fileInput =
      this.#shadow.querySelector<HTMLInputElement>('input[type="file"]')!;

    this.#triggerBtn.addEventListener("click", () => this.#toggle());

    // Close when clicking anywhere outside this host element.
    // Shadow DOM retargets events so e.target on the document listener is the
    // host element when the click originated inside the shadow — this.contains
    // returns true in that case and we correctly leave the panel open.
    document.addEventListener("click", (e) => {
      if (!this.contains(e.target as Node)) this.#close();
    });

    this.#fileInput.addEventListener("change", () => {
      const file = this.#fileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const xml = evt.target?.result;
        if (typeof xml !== "string") return;
        this.#dispatch(xml, file.name);
        this.#close();
        // Reset so the same file can be re-selected.
        this.#fileInput.value = "";
      };
      reader.readAsText(file);
    });
  }

  /** Pre-loaded sample scores shown in the dropdown, grouped by composer. */
  get samples(): ScoreLoaderSample[] {
    return this.#samples;
  }

  set samples(value: ScoreLoaderSample[]) {
    this.#samples = value;
    this.#renderSamples();
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  #renderSamples(): void {
    this.#samplesList.innerHTML = "";

    // Group samples by composer, preserving insertion order.
    const byComposer = new Map<Composer, ScoreLoaderSample[]>();
    for (const sample of this.#samples) {
      const group = byComposer.get(sample.composer) ?? [];
      group.push(sample);
      byComposer.set(sample.composer, group);
    }

    for (const [composer, scores] of byComposer) {
      const details = document.createElement("details");

      const summary = document.createElement("summary");
      summary.innerHTML = `<span>${composer}</span>${CHEVRON_ICON}`;
      details.appendChild(summary);

      for (const score of scores) {
        const btn = document.createElement("button");
        btn.className = "sample-btn";
        btn.type = "button";
        btn.textContent = score.label;
        btn.addEventListener("click", () => {
          this.#dispatch(score.xml, score.label);
          this.#close();
        });
        details.appendChild(btn);
      }

      this.#samplesList.appendChild(details);
    }
  }

  #toggle(): void {
    this.#open ? this.#close() : this.#openPanel();
  }

  #openPanel(): void {
    this.#open = true;
    this.#panel.classList.add("open");
    this.#triggerBtn.setAttribute("aria-expanded", "true");
  }

  #close(): void {
    this.#open = false;
    this.#panel.classList.remove("open");
    this.#triggerBtn.setAttribute("aria-expanded", "false");
  }

  #dispatch(xml: string, filename: string): void {
    this.dispatchEvent(
      new CustomEvent<ScoreLoadDetail>("score-load", {
        detail: { xml, filename },
        bubbles: true,
        composed: true,
      }),
    );
  }
}

customElements.define("score-loader", ScoreLoader);
