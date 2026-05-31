/**
 * Static HTML shell injected into `#app` at startup.
 *
 * Kept here so main.ts can be read top-to-bottom as wiring code without
 * wading through 70+ lines of markup.
 *
 * `__APP_VERSION__` is replaced at build time by Vite (`define` config) and
 * falls back to "dev" during `bun run dev`, so the footer always shows
 * something meaningful.
 */

declare const __APP_VERSION__: string;
const APP_VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
const REPO_URL = "https://github.com/KangaZero/DiffLizst";

export const APP_HTML = `
<header id="toolbar">
  <div class="toolbar-start">
    <span class="app-title">MusicDiff</span>
    <button id="view-toggle" class="view-toggle-btn" type="button" aria-label="Monaco diff view" aria-pressed="false" title="Monaco diff editor">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/>
      </svg>
    </button>
    <button id="git-diff-toggle" class="view-toggle-btn" type="button" aria-label="Git diff view" aria-pressed="false" title="Git-style diff view">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
        <path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 18v-2"/><path d="M8 14v-2"/>
        <path d="M16 18h-4"/><path d="M16 14h-2"/>
      </svg>
    </button>
  </div>
  <div class="toolbar-center change-nav" aria-label="Change navigation">
    <button id="prev-change" class="change-nav-btn" type="button" aria-label="Previous change (k or ArrowUp)" title="Previous change (k / ArrowUp)" disabled>
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m15 18-6-6 6-6"/>
      </svg>
    </button>
    <span id="change-counter" class="change-nav-counter" aria-live="polite" aria-atomic="true">0 of 0</span>
    <button id="next-change" class="change-nav-btn" type="button" aria-label="Next change (j or ArrowDown)" title="Next change (j / ArrowDown)" disabled>
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m9 18 6-6-6-6"/>
      </svg>
    </button>
  </div>
  <div class="toolbar-end">
    <diff-settings></diff-settings>
    <theme-toggle></theme-toggle>
  </div>
</header>
<section id="diff-page" aria-label="Raw diff view">
  <div class="diff-page-file-header">
    <span class="diff-file-old">scores/Chopin/etudeOp10No1.xml</span>
    <span class="diff-file-new">scores/Chopin/etudeOp10No2.xml</span>
    <button id="diff-edit-toggle" class="diff-edit-btn" type="button" aria-pressed="false" title="Toggle edit mode">Edit</button>
  </div>
  <div id="diff-editor-container"></div>
</section>
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
        <score-loader id="score-loader-1"></score-loader>
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
        <score-loader id="score-loader-2"></score-loader>
      </div>
      <div id="XML-notation-compare" class="notation-stage">Loading score…</div>
    </div>
  </div>
  <aside id="diff-summary" class="diff-summary" aria-label="Diff summary">
    <header class="diff-summary-header">
      <button id="diff-summary-toggle" class="diff-summary-toggle" type="button" aria-expanded="true" aria-controls="diff-summary-body">
        <svg class="diff-summary-chevron" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m9 18 6-6-6-6"/>
        </svg>
        <span>Changes</span>
        <span id="diff-summary-counts" class="diff-summary-counts" aria-live="polite"></span>
      </button>
    </header>
    <div id="diff-summary-body" class="diff-summary-body">
      <div class="diff-summary-filters" role="group" aria-label="Filter by change type">
        <button class="diff-summary-chip" type="button" data-filter="add" aria-pressed="true">added</button>
        <button class="diff-summary-chip" type="button" data-filter="remove" aria-pressed="true">removed</button>
        <button class="diff-summary-chip" type="button" data-filter="change" aria-pressed="true">changed</button>
      </div>
      <ol id="diff-summary-list" class="diff-summary-list" aria-live="polite"></ol>
    </div>
  </aside>
</section>
<div class="ticks"></div>
<section id="spacer"></section>
<footer class="app-footer" role="contentinfo">
  <div class="app-footer-inner">
    <a class="app-footer-link" href="${REPO_URL}" target="_blank" rel="noopener noreferrer">GitHub</a>
    <span class="app-footer-sep" aria-hidden="true">·</span>
    <span class="app-footer-version">v${APP_VERSION}</span>
    <span class="app-footer-sep" aria-hidden="true">·</span>
    <span class="app-footer-credits">
      Powered by
      <a class="app-footer-link" href="https://www.verovio.org/" target="_blank" rel="noopener noreferrer">Verovio</a>,
      <a class="app-footer-link" href="https://microsoft.github.io/monaco-editor/" target="_blank" rel="noopener noreferrer">Monaco</a>,
      <a class="app-footer-link" href="https://bun.com/" target="_blank" rel="noopener noreferrer">Bun</a>
    </span>
  </div>
</footer>
`;
