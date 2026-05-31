# DiffLizst

> Visual diff for MusicXML files — runs entirely in your browser, no backend, no upload.

## Why

- `git diff` on MusicXML produces line-noise. Two enharmonically equivalent encodings can differ in hundreds of lines while sounding identical, and a genuine pitch change can be buried inside dozens of reformatted lines.
- Existing tools that understand music diff either require a server round-trip or lock the comparison to measure-level granularity, hiding which note changed inside a measure.
- DiffLizst renders both scores with Verovio, overlays coloured change markers directly on the engraving, and lets you navigate change-by-change with a keyboard or on-screen buttons — without installing anything or sending your scores anywhere.

The same diff core ships as `@kangazero/difflizst-core` for embedding into your own tools.

[![CI](https://github.com/KangaZero/DiffLizst/actions/workflows/ci.yml/badge.svg)](https://github.com/KangaZero/DiffLizst/actions/workflows/ci.yml)
[![Deploy](https://github.com/KangaZero/DiffLizst/actions/workflows/deploy.yml/badge.svg)](https://kangazero.github.io/DiffLizst/)

---

## Features

### Diff engine

- LCS (Longest Common Subsequence) diff — same approach as `git diff --patience`.
- `ignoreWhitespace` strips leading/trailing space before comparing lines.
- `contextLines` controls how many unchanged lines surround each hunk (mirrors `git diff -U<n>`).
- `detailedDiff` (default on) diffs each direct child of a `<measure>` individually — notes, rests, directions — instead of treating the whole measure as one unit.
- Within-note summary: when both sides of a diff are `<note>` elements, the tooltip header shows human-readable field changes (`pitch: C4 → E4`, `duration: 4 → 8`, `voice: 1 → 2`).

### Viewer

- Verovio renders both scores to SVG. Overlays are positioned absolutely over `g.measure`, `g.note`, and `g.rest` elements.
- Per-score scale slider (40–140 %) and a shared "Scale (both)" slider. Resizing re-applies overlays without a re-diff.
- Monaco diff editor view — full syntax highlighting, edit mode lets you fix the XML in-browser and re-diff.
- Git-style unified / split diff view for reviewing raw hunks.
- Pagination for multi-page scores.

### UI

- Drag-and-drop or click-to-pick file upload on both score slots. Accepted extensions: `.xml`, `.musicxml`, `.mxl` (zipped MusicXML, decompressed client-side via fflate).
- Bundled sample scores available via dropdown — two Chopin études load by default.
- Next / prev change navigation: on-screen buttons in the toolbar, keyboard shortcuts (see below), and a "change N of M" live counter.
- Diff summary sidebar: collapsible panel listing every change, filter chips for added / removed / changed, click-to-focus. Open/closed state persists in `localStorage`. On mobile it slides in from the right as an overlay.
- Page footer with GitHub link, version number (read from `package.json` at build time), and credits.

### Accessibility

- WCAG AA contrast in both light and dark themes.
- Semantic landmarks: `<main>`, `<aside>`, `<nav role="toolbar">`, `role="region"` on each score stage.
- Skip-link at the top of the page (`Skip to content`).
- `prefers-reduced-motion` respected — slide and pulse animations are disabled.
- Every interactive element is keyboard-reachable; diff overlays carry `aria-label` descriptions.
- Touch targets are ≥ 44 × 44 px on coarse-pointer devices for host-document elements. Known gap: internal buttons inside the `<diff-settings>` and `<score-loader>` Shadow DOM components do not yet inherit coarse-pointer sizing — tracked as a follow-up.
- Responsive layout: panels stack vertically below 900 px, toolbar wraps at 600 px. Minimum tested viewport: 360 px wide.

---

## Quick start

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173/DiffLizst/`. Two Chopin études load by default. Drop your own `.xml` / `.musicxml` / `.mxl` files on either score panel to diff anything else.

---

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| `j` or `ArrowDown` | Next change |
| `k` or `ArrowUp` | Previous change |
| `Enter` or `Space` on a diff overlay | Focus that overlay |
| `Esc` | Close sidebar overlay (mobile) |

---

## Configuration

Open the gear icon (diff settings panel) to adjust:

| Setting | Default | Description |
|---------|---------|-------------|
| `contextLines` | `2` | Unchanged lines shown above/below each hunk |
| `ignoreWhitespace` | `true` | Strip leading/trailing whitespace before comparing |
| `showLineNumbers` | `true` | Line numbers alongside diff lines |
| `showMiniMap` | `false` | Monaco minimap |
| `detailedDiff` | `true` | Diff each measure child (note/rest/direction) individually |
| `gitDiffOrientation` | `split` | Split or unified layout for the git diff view |
| `algorithm` | `patience` | Diff algorithm preference (CLI mode only; no effect on browser LCS path) |

---

## Loading scores

Three ways to load a score into either slot:

1. **Drag and drop** — drag a file onto the score panel. The drop target becomes visible on `dragenter`.
2. **Click to pick** — press `Enter` or `Space` while the drop overlay is focused, or use the "Choose file" option in the score loader, to open a native file dialog.
3. **Bundled samples** — use the score loader dropdown to select from the included MusicXML examples.

Accepted extensions: `.xml`, `.musicxml`, `.mxl`. Files with `.mxl` are ZIP archives; DiffLizst reads `META-INF/container.xml` to find the primary rootfile and decompresses it in the browser using [fflate](https://github.com/101arrowz/fflate). No server involved.

---

## API — library (`@kangazero/difflizst-core`)

```bash
npm add @kangazero/difflizst-core
# or
pnpm add @kangazero/difflizst-core
```

```ts
import { diffXML, type XMLDiffOptions } from "@kangazero/difflizst-core";

const opts: XMLDiffOptions = {
  contextLines: 3,
  ignoreWhitespace: true,
  algorithm: "patience",
  detailedDiff: true,
};

const result = diffXML(oldXml, newXml, opts);

for (const [measureNumber, diff] of result.measures) {
  console.log(`measure ${measureNumber}: ${diff.changeType}`);
  for (const line of diff.lines) {
    console.log(`  ${line.type}: ${line.content}`);
  }
}
```

The library is browser-native — it uses `DOMParser` and `XMLSerializer`. To use it under Node.js 20+, polyfill those globals. The project's own vitest setup uses [linkedom](https://github.com/WebReflection/linkedom) for this; see `src/tests/setup.ts` for the adapter.

### Public exports

| Export | Kind | Description |
|--------|------|-------------|
| `diffXML` | function | Diff two MusicXML strings; returns `XMLDiffResult` |
| `XMLDiffOptions` | type | Input options: `contextLines`, `ignoreWhitespace`, `algorithm`, `detailedDiff` |
| `XMLDiffResult` | type | Maps of `measures`, `credits`, `partLists`, `children` |
| `ElementDiff` | type | Per-element result: `changeType`, `label`, `lines[]`, optional `summary[]` |
| `DiffLine` | type | Discriminated union: `add` / `remove` / `context` lines |
| `DiffLineType` | type | `"add" \| "remove" \| "context"` |
| `ChangeType` | type | `"add" \| "remove" \| "change"` |
| `ChildDiffKey` | type | Map key shape for `detailedDiff: true` child diffs |

---

## Architecture

DiffLizst runs entirely in the browser — no server, no WebSocket, no file upload. Verovio (WASM) renders each MusicXML string to an SVG engraving; the SVG is injected into the notation stage and `g.measure` / `g.note` / `g.rest` elements are indexed by their `xml:id` attributes. `diffXML.ts` runs an LCS algorithm over the serialised XML of each structural element, producing `XMLDiffResult`. `applyDiffHighlights.ts` reads that result and positions absolutely-placed overlay `<div>` elements over the matching SVG groups — no SVG mutation needed. Monaco Editor handles the raw XML diff view independently, receiving the same two XML strings. The `changeIndex.ts` utility flattens all diff buckets into a single ordered array so the next/prev navigator and sidebar can share one traversal.

---

## Development

```bash
pnpm dev          # Vite dev server on :5173/DiffLizst/
pnpm typecheck    # tsc --noEmit
pnpm lint         # Biome check
pnpm lint:fix     # Biome check --write
```

---

## Testing

### Unit tests (vitest)

```bash
pnpm test
```

136 tests across 6 test files:

- `diffXML.test.ts` — option-matrix combinations: identical scores, credit/measure/child diffs, `contextLines`, `ignoreWhitespace`, `detailedDiff`, `partLists`.
- `diffXML.integration.test.ts` — real Chopin and Rachmaninoff fixtures, cross-composer diffs, identity diffs, `ElementDiff` object identity across runs.
- `fixtures-smoke.test.ts` — every file in `tests/fixtures/musicxml-real/` is parsed and self-diffed; asserts zero changes and a valid root element.
- `summariseNoteDiff.test.ts` — the human-readable field walker that produces `pitch: C4 → E4` summaries.
- `changeIndex.test.ts` — `flattenChanges` ordering and `countByChangeType` bucketing.
- `applyDiffHighlights.test.ts` — `xml:id` → measure-number and note index mapping.

### End-to-end tests (Playwright, Chromium)

First-time setup (downloads ~100 MB of Chromium):

```bash
pnpm test:e2e:install
```

Then:

```bash
pnpm test:e2e
```

41 e2e cases across 3 spec files, driving the real preview bundle:

- `diff-flow.spec.ts` — app boot, Verovio rendering, overlay highlights, Monaco view, git diff view, scale slider, settings panel, library bundle import.
- `features.spec.ts` — file upload (XML via `score-file-drop`, drag-drop, `.mxl` decompression), next/prev change navigation, diff summary sidebar, page footer, within-note tooltip summary.
- `library-export.spec.ts` — `dist-lib/` bundle imports cleanly; `diffXML` runs and produces non-empty results.

### Full gate (pre-push)

```bash
pnpm verify
```

Runs lint + typecheck + unit tests + `build` + `build:lib`. End-to-end is excluded from `verify` because it requires Chromium and takes ~30 s — run it explicitly before opening a PR.

### Adding a fixture

Place a `.xml` or `.musicxml` file in `tests/fixtures/musicxml-real/`. The smoke suite discovers fixtures at runtime via `readdirSync`, so no manifest edit is needed. Update `MANIFEST.md` with the source URL and license.

Real-world fixture corpus is sourced from the [OpenSheetMusicDisplay](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay) test data, BSD-3-Clause licensed. All compositions reference composers who died before 1955 and are public domain under the Berne Convention. See `tests/fixtures/musicxml-real/MANIFEST.md` for per-file details.

---

## Accessibility

DiffLizst targets WCAG 2.1 AA. Semantic landmarks used: `<header role="banner">`, `<main>`, `<aside aria-label="Diff summary">`, `<nav role="toolbar">`, `role="region"` on each score stage. The skip-link at the top of the page (`Skip to content`) is the first focusable element. All interactive elements are reachable by keyboard tab order. Diff overlays carry `aria-label` values. The change counter uses `aria-live="polite"` so screen readers announce navigation. `prefers-reduced-motion` disables slide and pulse animations.

On coarse-pointer (touch) devices, host-document interactive elements enforce a 44 × 44 px minimum touch target. Known gap: buttons inside the `<diff-settings>` and `<score-loader>` Shadow DOM components do not yet receive these constraints — they are tracked as a follow-up and not part of the WCAG AA claim.

Panels stack vertically below 900 px. The toolbar wraps at 600 px. The diff summary sidebar becomes a full-height slide-in overlay on mobile, dismissible with `Esc` or the close button.

---

## Browser support

Evergreen Chromium, Firefox, and Safari. TypeScript target: ES2022. No polyfills shipped. Verovio WASM requires `WebAssembly` support (all evergreen browsers since 2017).

---

## Releasing

```bash
git tag vX.Y.Z && git push --tags
```

This triggers `release.yml`. The workflow re-runs the full CI gate, builds the library, and publishes to npm **only if** the `PUBLISH_TO_NPM` repo variable is `true` and the `NPM_TOKEN` repo secret is set. If either is absent, it logs `publish skipped` and exits 0 — tag-pushing is non-destructive by default.

Merging to `main` triggers `deploy.yml`, which builds and deploys the web app to GitHub Pages.

Steps to cut a release:

1. Bump `version` in `package.json`.
2. Commit and push.
3. `git tag vX.Y.Z && git push --tags`.

---

## Development — production build

```bash
pnpm build        # Web app → dist/ (what GitHub Pages serves)
pnpm build:lib    # Library → dist-lib/
pnpm preview      # Serve dist/ locally on :4173
```

---

## License

MIT — see [`LICENSE`](LICENSE).

---

## Credits

- [Verovio](https://www.verovio.org/) — MusicXML to SVG engraving (LGPL 3)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) — raw XML diff view (MIT)
- [Vite](https://vitejs.dev/) — build tooling (MIT)
- [Vitest](https://vitest.dev/) — unit test runner (MIT)
- [Playwright](https://playwright.dev/) — end-to-end tests (Apache 2.0)
- [Biome](https://biomejs.dev/) — lint and format (MIT)
- [fflate](https://github.com/101arrowz/fflate) — client-side `.mxl` decompression (MIT)
- [linkedom](https://github.com/WebReflection/linkedom) — DOM polyfill for vitest's Node environment (ISC)
