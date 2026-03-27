import type { XMLDiffOptions } from "@/utils/diffXML";
/**
 * `<diff-settings>` Web Component
 *
 * A gear-icon button that opens a dropdown panel with diff configuration
 * controls.  When any setting changes the component immediately dispatches a
 * `settings-change` CustomEvent so the parent can re-run the diff.
 *
 * Rendered inside Shadow DOM so its styles are fully encapsulated and cannot
 * conflict with the host page's CSS.
 *
 * @fires settings-change — Fired whenever any field is changed.
 *   `detail` is a {@link DiffSettingsValue} snapshot of the current values.
 *
 * @example
 * ```html
 * <diff-settings></diff-settings>
 * ```
 * ```ts
 * const el = document.querySelector('diff-settings')!;
 * el.addEventListener('settings-change', (e) => {
 *   const settings = (e as CustomEvent<DiffSettingsValue>).detail;
 *   xmlDiff = diffXML(xml1, xml2, settings);
 * });
 * ```
 */

/**
 * The set of user-configurable diff options surfaced in the settings panel.
 *
 * These map directly to the flags you would pass to `git diff`:
 * - `contextLines`      → `-U<n>`
 * - `ignoreWhitespace`  → `-w`
 * - `algorithm`         → `--patience` / `--histogram` / (default Myers)
 *
 * `algorithm` is stored and forwarded in the event but only takes effect when
 * the app is running in git-backed CLI mode (Bun).  It has no effect on the
 * browser LCS diff path.
 */
export type DiffSettingsValue = XMLDiffOptions & {
  // contextLines: number;
  // ignoreWhitespace: boolean;
  // algorithm: "patience" | "histogram" | "myers";
  /** When `true`, line numbers are rendered alongside each diff line. Default: `true`. */
  showLineNumbers: boolean;
  showMiniMap: boolean;
  gitDiffOrientation: "split" | "unified";
};

/** Default values shown when the component first renders. */
export const DEFAULT_SETTINGS: DiffSettingsValue = {
  contextLines: 2,
  ignoreWhitespace: true,
  algorithm: "patience",
  showLineNumbers: true,
  showMiniMap: false,
  gitDiffOrientation: "split",
};

// Gear icon (Lucide `settings-2` path, MIT licensed)
const GEAR_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
       fill="none" stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>`;

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
    justify-content: center;
    width: 38px;
    height: 38px;
    border: 1px solid var(--border, #e5e4e7);
    border-radius: var(--radius-md, 8px);
    background: transparent;
    color: var(--text-h, #08060d);
    cursor: pointer;
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
    top: calc(100% + 8px);
    right: 0;
    z-index: 300;
    min-width: 260px;
    background: var(--code-bg, #f4f3ec);
    border: 1px solid var(--border, #e5e4e7);
    border-radius: var(--radius-md, 8px);
    box-shadow: var(--shadow, rgba(0,0,0,0.1) 0 10px 15px -3px);
    padding: 8px 0;
  }

  .panel.open {
    display: block;
  }

  .panel-header {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text, #6b6375);
    padding: 4px 14px 8px;
    border-bottom: 1px solid var(--border, #e5e4e7);
    margin-bottom: 4px;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 7px 14px;
  }

  .row:hover {
    background: var(--accent-bg, rgba(170,59,255,0.05));
  }

  label {
    font-size: 13px;
    color: var(--text-h, #08060d);
    cursor: pointer;
    flex: 1 1 auto;
    user-select: none;
  }

  .hint {
    font-size: 11px;
    color: var(--text, #6b6375);
    margin-top: 1px;
  }

  .label-wrap {
    display: flex;
    flex-direction: column;
  }

  input[type="number"] {
    width: 52px;
    padding: 3px 6px;
    border: 1px solid var(--border, #e5e4e7);
    border-radius: 4px;
    background: var(--bg, #fff);
    color: var(--text-h, #08060d);
    font-size: 13px;
    text-align: center;
  }

  input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: var(--accent, #aa3bff);
    cursor: pointer;
    flex-shrink: 0;
  }

  select {
    padding: 3px 6px;
    border: 1px solid var(--border, #e5e4e7);
    border-radius: 4px;
    background: var(--bg, #fff);
    color: var(--text-h, #08060d);
    font-size: 13px;
    cursor: pointer;
  }

  .section-divider {
    height: 1px;
    background: var(--border, #e5e4e7);
    margin: 4px 0;
  }

  .git-only-note {
    font-size: 11px;
    color: var(--text, #6b6375);
    padding: 4px 14px 6px;
    font-style: italic;
  }
</style>

<button class="trigger" type="button" aria-label="Diff settings" aria-expanded="false" aria-haspopup="true">
  ${GEAR_SVG}
</button>

<div class="panel" role="menu" aria-label="Diff settings panel">
  <div class="panel-header">Diff settings</div>

  <div class="row">
    <div class="label-wrap">
      <label for="ctx-lines">Context lines</label>
      <span class="hint">Lines shown around each change (git -U&lt;n&gt;)</span>
    </div>
    <input id="ctx-lines" type="number" min="0" max="10" value="${DEFAULT_SETTINGS.contextLines}" />
  </div>

  <div class="row">
    <div class="label-wrap">
      <label for="ignore-ws">Ignore whitespace</label>
      <span class="hint">Strip leading/trailing spaces (git -w)</span>
    </div>
    <input id="ignore-ws" type="checkbox" ${DEFAULT_SETTINGS.ignoreWhitespace ? "checked" : ""} />
  </div>

  <div class="row">
    <div class="label-wrap">
      <label for="show-line-nos">Show line numbers</label>
      <span class="hint">Display line numbers in diff view &amp; tooltip</span>
    </div>
    <input id="show-line-nos" type="checkbox" ${DEFAULT_SETTINGS.showLineNumbers ? "checked" : ""} />
  </div>
<div class="row">
    <div class="label-wrap">
      <label for="show-mini-map">Show Mini Map</label>
      <span class="hint">Display mini map in the raw editor</span>
    </div>
    <input id="show-mini-map" type="checkbox" ${DEFAULT_SETTINGS.showMiniMap ? "checked" : ""} />
  </div>
<div class="row">
    <div class="label-wrap">
      <label for="git-diff-orientation">Git Diff Orientation</label>
      <span class="hint">Choose the git diff orientation</span>
    </div>
<select id="git-diff-orientation">
      <option value="split" ${DEFAULT_SETTINGS.gitDiffOrientation === "split" ? "selected" : ""}>split</option>
      <option value="unified" ${DEFAULT_SETTINGS.gitDiffOrientation === "unified" ? "selected" : ""}>unified</option>
    </select>
  </div>
  <div class="section-divider"></div>
  <div class="row">
    <div class="label-wrap">
      <label for="algorithm">Algorithm</label>
      <span class="hint">Git mode only (no effect in browser)</span>
    </div>
    <select id="algorithm">
      <option value="patience" ${DEFAULT_SETTINGS.algorithm === "patience" ? "selected" : ""}>patience</option>
      <option value="histogram" ${DEFAULT_SETTINGS.algorithm === "histogram" ? "selected" : ""}>histogram</option>
      <option value="myers"    ${DEFAULT_SETTINGS.algorithm === "myers" ? "selected" : ""}>myers</option>
    </select>
  </div>
</div>
`;

export class DiffSettings extends HTMLElement {
  private _trigger!: HTMLButtonElement;
  private _panel!: HTMLDivElement;
  private _ctxInput!: HTMLInputElement;
  private _wsInput!: HTMLInputElement;
  private _lineNosInput!: HTMLInputElement;
  private _miniMapInput!: HTMLInputElement;
  private _gitDiffOrientationSelect!: HTMLSelectElement;
  private _algoSelect!: HTMLSelectElement;

  /** Bound reference kept so the listener can be removed on disconnect. */
  private _onOutsideClick = (e: MouseEvent) => {
    if (!this.contains(e.target as Node)) this._close();
  };

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    if (!this.shadowRoot) console.error("No shadowRoot detected");
    this.shadowRoot?.appendChild(template.content.cloneNode(true));

    this._trigger = this.shadowRoot?.querySelector(".trigger")!;
    this._panel = this.shadowRoot?.querySelector(".panel")!;
    this._ctxInput = this.shadowRoot?.querySelector("#ctx-lines")!;
    this._wsInput = this.shadowRoot?.querySelector("#ignore-ws")!;
    this._lineNosInput = this.shadowRoot?.querySelector("#show-line-nos")!;
    this._miniMapInput = this.shadowRoot?.querySelector("#show-mini-map")!;
    this._gitDiffOrientationSelect = this.shadowRoot?.querySelector(
      "#git-diff-orientation",
    )!;
    this._algoSelect = this.shadowRoot?.querySelector("#algorithm")!;
  }

  connectedCallback() {
    this._trigger.addEventListener("click", () => this._toggle());

    // Emit on any control change so the parent re-runs the diff immediately
    this._ctxInput.addEventListener("input", () => this._emit());
    this._wsInput.addEventListener("change", () => this._emit());
    this._miniMapInput.addEventListener("change", () => this._emit());
    this._algoSelect.addEventListener("change", () => this._emit());
    this._lineNosInput.addEventListener("change", () => this._emit());
    this._gitDiffOrientationSelect.addEventListener("change", () =>
      this._emit(),
    );
    // Close when user clicks outside the component
    document.addEventListener("click", this._onOutsideClick);

    // Close on Escape key
    this.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Escape") this._close();
    });
  }

  disconnectedCallback() {
    document.removeEventListener("click", this._onOutsideClick);
  }

  /** Push new values into all controls without firing a change event. */
  set value(v: DiffSettingsValue) {
    this._ctxInput.value = String(v.contextLines);
    this._wsInput.checked = v.ignoreWhitespace;
    this._algoSelect.value = v.algorithm;
    this._lineNosInput.checked = v.showLineNumbers;
    this._miniMapInput.checked = v.showMiniMap;
    this._gitDiffOrientationSelect.value = v.gitDiffOrientation;
  }

  /** Current snapshot of all settings. */
  get value(): DiffSettingsValue {
    return {
      contextLines: Math.max(
        0,
        Math.min(10, Number(this._ctxInput.value) || 0),
      ),
      ignoreWhitespace: this._wsInput.checked,
      algorithm: this._algoSelect.value as DiffSettingsValue["algorithm"],
      showMiniMap: this._miniMapInput.checked,
      gitDiffOrientation: this._gitDiffOrientationSelect
        .value as DiffSettingsValue["gitDiffOrientation"],
      showLineNumbers: this._lineNosInput.checked,
    };
  }

  /** Open the settings panel. */
  private _open() {
    this._panel.classList.add("open");
    this._trigger.setAttribute("aria-expanded", "true");
  }

  /** Close the settings panel. */
  private _close() {
    this._panel.classList.remove("open");
    this._trigger.setAttribute("aria-expanded", "false");
  }

  /** Toggle open/closed state. */
  private _toggle() {
    this._panel.classList.contains("open") ? this._close() : this._open();
  }

  /**
   * Dispatch a `settings-change` CustomEvent with the current values.
   * Bubbles so it can be caught on any ancestor.
   */
  private _emit() {
    this.dispatchEvent(
      new CustomEvent<DiffSettingsValue>("settings-change", {
        detail: this.value,
        bubbles: true,
        composed: true, // crosses shadow DOM boundary
      }),
    );
  }
}

customElements.define("diff-settings", DiffSettings);
