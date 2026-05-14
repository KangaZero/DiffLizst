/**
 * Static HTML shell injected into `#app` at startup.
 *
 * Kept here so main.ts can be read top-to-bottom as wiring code without
 * wading through 70+ lines of markup.
 */
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
</section>
<div class="ticks"></div>
<section id="spacer"></section>
`;
