# Lighthouse + Web Vitals audit

Audit run: 2026-05-31. Lighthouse 13.3.0 (via `pnpm dlx lighthouse@latest`).
Target: production build served by `vite preview` on `http://localhost:4180/DiffLizst/`.
Why not the dev server: with `vite dev`, both desktop and mobile runs failed with
`NO_FCP` — the dev server's on-demand transform of the Monaco source graph
exceeded Lighthouse's page-load window. The audit reflects the shipped build
(`pnpm build` output in `dist/`), which is what the deployed app actually
serves.

Raw reports (not committed): `/tmp/lh-desktop.report.{html,json}`,
`/tmp/lh-mobile.report.{html,json}`.

---

## 1. Scores summary

| Category       | Desktop | Mobile | Web-Vitals (mobile)              |
| -------------- | :-----: | :----: | -------------------------------- |
| Performance    |  17     |   26   | FCP 18.3 s · LCP 19.9 s · TBT 3 030 ms · CLS 0 |
| Accessibility  |  97     |   97   | —                                |
| Best Practices | 100     |  100   | —                                |
| SEO            |  90     |   90   | —                                |

Desktop Web-Vitals: FCP 3.1 s · LCP 3.5 s · TBT 700 ms · CLS **0.514** ·
TTI 3.9 s.

> Note on the CLS asymmetry. Mobile shows CLS 0 because the page never
> reaches the post-Verovio render before Lighthouse's measurement window
> closes (FCP/LCP both ~18-20 s on a Slow-4G + 4× CPU profile). On
> desktop, Verovio finishes its first SVG paint inside the window, so the
> shift is observed: CLS 0.514, attributed to `#XML-notation` (height
> grows from "Loading score…" placeholder to ~2 300 px). The shift is
> real on every load; the mobile profile just doesn't catch it.

## 2. Top 5 Performance blockers

1. **One eager 16.7 MB JS chunk (3.5 MB gzipped) — `dist/assets/index-CQO4rKty.js`.**
   Lighthouse measures 6.25 s of main-thread scripting on mobile for this
   single file. It's the entire Monaco bundle pulled in by static imports.
   Root cause: `src/main.ts:7` (`import EditorWorker from "monaco-editor/esm/.../editor.worker?worker"`),
   `src/bootstrap/monaco-page.ts:1` (`import * as monaco from "monaco-editor"`),
   and `src/components/themeToggle/index.ts:1` (also `import * as monaco`)
   all top-level imports. Fix: dynamic-import Monaco from inside
   `renderCodeDiffPage` and the theme-toggle's `apply()`; remove the
   `EditorWorker` static import and register `MonacoEnvironment.getWorker`
   inside the dynamic-import branch as well.
2. **`#XML-notation` has no reserved height → CLS 0.514** (`src/style.css:770`).
   The `.notation-stage` rule sets `width` but not `min-height`/`aspect-ratio`,
   so the placeholder `"Loading score…"` text occupies ~24 px and the
   post-Verovio SVG jumps to ~2 300 px. Fix: `min-height: 60vh;` (or an
   `aspect-ratio` matched to a typical score page) until first paint.
3. **All four Monaco language workers shipped** (`ts.worker` 6.6 MB,
   `css.worker` 1 MB, `html.worker` 700 KB, `json.worker` 400 KB). The diff
   editor only opens `xml` models. Fix: in `MonacoEnvironment.getWorker`,
   only return `editor.worker` (no language-specific worker is needed for
   `xml`). Drops 8.7 MB from the asset folder and stops the workers from
   being requested.
4. **80 Monaco language chunks ship to `dist/assets/`** (abap, apex,
   azcli, cameligo, postiats, sophia, … 79 unique language modules). They
   aren't loaded synchronously, but they're emitted and indexed. Fix:
   `import "monaco-editor/esm/vs/editor/editor.api"` plus only the languages
   the app uses (`xml`, optionally `json`) instead of `import * as monaco
   from "monaco-editor"`. This shrinks both the eager chunk and the dist
   surface.
5. **Render-blocking CSS** (`dist/assets/index-BSoQj8mm.css`, 28 KB,
   ~87 ms wasted). Modest, but Lighthouse flags it on both presets. Fix:
   inline the above-the-fold critical CSS (toolbar + notation skeleton)
   into `index.html`, and load the rest with `<link rel="preload"
   as="style" onload="this.rel='stylesheet'">` — or split via
   `vite-plugin-purgecss`/CSS-modules if you don't want to hand-extract.

## 3. Accessibility findings

Lighthouse a11y score is 97 (both presets). The manual WCAG-AA pass
covered colour contrast, labels, landmarks, focus order — Lighthouse
confirms those are clean. **One issue the manual pass missed:**

- **`target-size` failed** — every pagination control (`button.page-btn`)
  and `button.control` is smaller than the 24×24 CSS-pixel minimum on
  mobile (WCAG 2.2 SC 2.5.8 "Target Size — Minimum"). Selectors flagged:
  `div.container > button.page-btn` (×10+ pagination buttons),
  `div.container > button.control` (page-nav arrows). Fix: bump
  `.page-btn` and `.control` to at least `min-width: 24px; min-height: 24px`,
  or wrap them in a 24×24 hit area while keeping the visual size. Look in
  the pagination web component's shadow CSS.

Everything else in the a11y category passed binary checks.

## 4. Best Practices findings

Score is 100. Lighthouse still flags one informational item:

- **`valid-source-maps` failed.** No `.map` files are emitted to `dist/`.
  Fix in `vite.config.ts` web-mode block: add `build: { sourcemap: true }`
  (or `"hidden"` if you don't want them publicly browsable but still want
  Sentry-style upload later). Adds ~30-50 MB to the dist folder but
  doesn't ship to the client unless explicitly fetched.

Not flagged (all pass): HTTPS (Lighthouse skips this for `localhost`;
GitHub Pages serves the deployed site over HTTPS, verified — production
URL is `https://kangazero.github.io/DiffLizst/`), console errors,
deprecated APIs, passive listeners, `document.write`, geolocation/notification
permission prompts on load.

## 5. SEO findings

Score is 90. Two real issues, plus one fragile metadata story:

- **`meta-description` failed.** `index.html` has no
  `<meta name="description">`. Fix: add a one-sentence pitch
  ("Browser-native structural diff for MusicXML scores. No backend, no
  upload — diff two scores side-by-side in notation, XML, or git-style
  view.")
- **`<title>` is `"vite-project"`** (`index.html:7`). Lighthouse didn't
  fail this audit (it passes any non-empty title), but the title is the
  scaffolding default — set it to `"DiffLizst — MusicXML score diff"` or
  similar.
- **No `<meta name="theme-color">`** (cosmetic; affects Android Chrome
  address-bar tint). Add `<meta name="theme-color" content="#ffffff"
  media="(prefers-color-scheme: light)">` and a dark counterpart.

Passing: `<html lang="en">`, viewport meta, crawlable (not behind robots),
font sizes are legible.

## 6. Bundle-size analysis

### What ships now

```
16.7 MB  index-CQO4rKty.js        ← Monaco core + all 80 languages, plus app
 6.6 MB  ts.worker.js             ← TS/JS language services (UNUSED in app)
 1.0 MB  css.worker.js            ← UNUSED
 700 KB  html.worker.js           ← UNUSED
 400 KB  json.worker.js           ← UNUSED
 280 KB  editor.worker.js         ← needed
 168 KB  index.css
 79 × <30 KB language chunks      ← UNUSED (abap, apex, azcli, …)
```

Total dist/assets: ~26 MB raw / ~5 MB over the wire after gzip on first
load (only the `index-...js` chunk + CSS load eagerly; the workers and
language chunks are lazy-emitted by Vite but the `index-...js` already
imports the Monaco core synchronously).

### Why it's so big

`monaco-editor`'s default entry point (`import * as monaco from
"monaco-editor"`) pulls in the language registry, which references every
language module in the package. Vite/Rollup is correctly code-splitting
each language into its own chunk, but the *registry itself* — the entries
that map `"abap"` → `() => import("./abap")` — bloats the core bundle
and prevents tree-shaking the registry table away.

### The real Monaco surface this app needs

From the source (`src/bootstrap/monaco-page.ts`):

- `monaco.editor.createDiffEditor` (diff editor)
- `monaco.editor.createModel(xml, "xml")` (xml language only)
- `monaco.editor.setTheme` (used in `themeToggle`)
- the **editor worker** (general edit infra)

So the minimum Monaco import surface is:

```ts
import { editor as monacoEditor } from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/basic-languages/xml/xml.contribution";
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
```

That trims ~10-12 MB of language and language-service code out of the
final chunk. Verovio stays as-is — it's the primary view, and the WASM
module is loaded asynchronously already.

### Suggested Vite config

```ts
// vite.config.ts (web mode)
build: {
  sourcemap: "hidden",
  rollupOptions: {
    output: {
      manualChunks: {
        verovio: ["verovio"],
        // Monaco only lands here when it's actually imported (post-toggle).
      },
    },
  },
},
```

Plus the dynamic-import refactor in `src/bootstrap/monaco-page.ts` and
`src/components/themeToggle/index.ts`.

## 7. Suggested fixes — itemized with effort

| # | Fix | Effort | Impact |
|---|---|---|---|
| 1 | Dynamic-import Monaco (`monaco-page.ts`, `themeToggle/index.ts`, `main.ts` worker registration) | **M** | Drops eager JS by ~3.5 MB gzip; cuts TBT ~2-3 s on mobile |
| 2 | Pin Monaco to XML-only language contribution + editor worker only (no `ts.worker`/`css.worker`/`html.worker`/`json.worker`) | **S** | Drops ~8.7 MB of emitted workers; cuts post-toggle load |
| 3 | Add `min-height: 60vh` (or matched aspect-ratio) to `.notation-stage` | **XS** | CLS 0.514 → ~0 on desktop |
| 4 | Add `<meta name="description">`, fix `<title>`, add `<meta name="theme-color">` | **XS** | SEO 90 → 100 |
| 5 | Enlarge `.page-btn` / `.control` to ≥24×24 px hit area | **XS** | A11y 97 → 100 (target-size) |
| 6 | Enable production sourcemaps (`build.sourcemap: "hidden"` in `vite.config.ts`) | **XS** | Best Practices: source-maps audit passes; better error attribution in prod |
| 7 | Inline critical CSS for toolbar + notation skeleton; defer the rest | **M** | FCP -300-500 ms on mobile |
| 8 | Add `<link rel="preload" as="fetch" crossorigin="anonymous" href="…verovio.wasm">` to shorten the Verovio cold-start chain | **S** | LCP -200-400 ms once Monaco is gone (Verovio becomes the new LCP candidate) |
| 9 | Consider `requestIdleCallback`/`scheduler.postTask` for the diff index-build (`flattenChanges`, `buildMeasureIdMap`) so TBT drops further on slow CPUs | **S** | TBT -200-400 ms on mobile |
| 10 | Replace `bun.com` link in footer (`html-shell.ts:138`) with pnpm-relevant credit (post-migration cleanup, unrelated to perf but a stale string) | **XS** | Cosmetic |

## 8. Score targets after fixes

| Category       | Today (D / M) | Target (D / M) | After which fixes |
|----------------|:--------:|:------:|---|
| Performance    | 17 / 26  | **90 / 75** | 1, 2, 3, 7, 8, 9 |
| Accessibility  | 97 / 97  | **100 / 100** | 5 |
| Best Practices | 100 / 100 | 100 / 100 | 6 keeps it there |
| SEO            | 90 / 90  | **100 / 100** | 4 |

Mobile Performance won't hit 90 without genuine work — Verovio's WASM
load + first SVG render is the new floor once Monaco is split out. 75-85
is realistic; pushing past 90 on the Slow-4G/4× CPU profile would require
showing a non-Verovio first paint (e.g. the toolbar + an empty state)
before the WASM module initialises.

Web Vitals targets after fixes (mobile, Slow-4G/4× CPU):

| Metric | Now | Target | Vitals "Good" threshold |
|--------|-----|--------|---|
| LCP    | 19.9 s | < 4.0 s | ≤ 2.5 s |
| FCP    | 18.3 s | < 2.5 s | ≤ 1.8 s |
| TBT    | 3 030 ms | < 600 ms | ≤ 200 ms |
| CLS    | 0 (desktop: 0.514) | < 0.1 (both) | ≤ 0.1 |

Hitting the "Good" thresholds across the board on a Slow-4G mobile
profile is unlikely while Verovio remains the primary renderer — it's a
~1.4 MB WASM module that has to download, compile, and render before
LCP. The "Needs Improvement" range is the honest target.

## What I couldn't measure

- **First audit attempt against the dev server (`localhost:5173`)** failed
  with `NO_FCP` on both presets — the dev-mode Monaco transform graph is
  too slow for Lighthouse's load timer. Switched to a `vite preview` of
  the production build on port 4180 (4173 was already in use). Numbers
  in this report reflect the production build, which is what the deployed
  app actually serves.
- **LCP element attribution on mobile.** The mobile audit reported
  `LCP 19.9 s, score 0` but never reached a stable post-Verovio frame
  inside the measurement window, so `largest-contentful-paint-element`
  is empty. On desktop the same audit was also empty — Lighthouse
  recorded the metric but didn't tag a specific element (likely because
  the LCP frame coincides with the Verovio SVG mount, which fires
  outside Lighthouse's tracing window for new-element discovery). CLS
  attribution did work and pointed at `#XML-notation` as expected.
- **HTTPS audit.** Skipped automatically by Lighthouse on `localhost`.
  Verified separately: GitHub Pages serves `kangazero.github.io/DiffLizst/`
  over HTTPS with a valid Let's Encrypt cert, so the production deploy
  passes.
