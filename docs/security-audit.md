# Security Audit — DiffLizst

Branch: `refactor/diff-and-tests` @ `03f7309`
Date: 2026-05-31
Scope: static review only. No exploits run; no files modified outside this doc.

---

## 1. Verdict

**PASS, with one moderate transitive-dep advisory cluster that cannot be patched without an upstream Monaco release.**

The app is genuinely no-backend: zero runtime `fetch` / `XMLHttpRequest` / `WebSocket` calls, no analytics, no third-party scripts. Every `innerHTML` write that touches user-supplied data routes content through `escapeHTML`. `DOMParser` is invoked with `"application/xml"` everywhere (never `"text/html"`). PWA scope, `start_url`, and `id` are all correctly pinned to `/DiffLizst/`. CI workflows use only first-party / well-known actions. `.npmrc` enforces a 7-day minimum release age — supply-chain hardening that most projects skip.

The one real finding is **8 moderate-severity DOMPurify advisories** transitive through `monaco-editor → vendored dompurify@3.2.7`. These cannot be fixed by `pnpm overrides` because Monaco ships DOMPurify as a vendored copy (not a real dep). Practical exploitability is low for DiffLizst's use case (Monaco only invokes DOMPurify when rendering Markdown hover tooltips, and we do not feed user content into those paths), but the advisories will continue to show up on `pnpm audit` until Microsoft cuts a Monaco release with `dompurify ≥ 3.4.0`.

Severity ceiling: **moderate**. No high or critical findings.

---

## 2. Frontend XSS / Injection

### 2.1 `innerHTML` sites — full inventory

| File:Line | What's injected | Verdict |
|---|---|---|
| `src/main.ts:76` | `APP_HTML` — static template string from `html-shell.ts` | Safe (static) |
| `src/bootstrap/notation-pipeline.ts:57,141` | `tk.renderToSVG(page)` — verovio C++ output | Safe (trusted producer; verovio escapes its own SVG) |
| `src/bootstrap/git-diff-page.ts:141` | Static empty-state string | Safe |
| `src/bootstrap/git-diff-page.ts:170` | Concatenation of hunk HTML from `unifiedHunkHTML` / `splitHunkHTML` | Safe per content escaping (see 2.2) |
| `src/utils/applyDiffHighlights.ts:211` | `cachedTooltipHTML(diff, …)` cached output of `buildTooltipHTML` | Safe per content escaping (see 2.2) |
| `src/components/fileDrop/index.ts:42` | Static SVG + Lucide icon strings | Safe (static) |
| `src/components/themeToggle/index.ts:33,87` | Static `template.innerHTML` and `MOON_ICON`/`SUN_ICON` constants | Safe (static) |
| `src/components/diffSummary/index.ts:58` | Three `<span>`s wrapping numeric counts | Safe (numbers from `countByChangeType`) |
| `src/components/diffSummary/index.ts:70` | Empty-string reset | Safe (no content) |
| `src/components/diffSummary/index.ts:84` | `<button>` template with `escapeText(entry.diff.label)` | Safe (label escaped) |
| `src/components/pages/index.ts:8` | Static `template.innerHTML` | Safe (static) |
| `src/components/pages/index.ts:205` | `toolkit.renderToSVG(page)` | Safe (trusted producer) |
| `src/components/diffSettings/index.ts:89` | Static `template.innerHTML` | Safe (static) |
| `src/components/scoreLoader/index.ts:96` | Static `template.innerHTML` | Safe (static) |
| `src/components/scoreLoader/index.ts:362` | Empty-string reset | Safe |
| `src/components/scoreLoader/index.ts:376` | `` `<span>${composer}</span>${CHEVRON_ICON}` `` | Safe-by-type (`composer: Composer` is a closed string-literal union, not user input) — but the type guarantee is the only thing keeping it safe. Worth `escapeHTML(composer)` for defence-in-depth if `Composer` is ever widened. |

No `outerHTML`, `insertAdjacentHTML`, `document.write`, or `eval(` anywhere in `src/`. Confirmed via grep.

### 2.2 Content escaping in diff renderers

- `src/bootstrap/git-diff-page.ts:7-9` defines `escapeHTML` (escapes `&`, `<`, `>`). Used at lines 33, 53, 96 — every spot where `line.content` (from user XML) enters the HTML.
- `src/utils/applyDiffHighlights.ts:96-98` defines a duplicate `escapeHTML`. Used at lines 109, 110, 112 (note summary fields) and 120 (line content). **Two copies of the same escape function is a small DRY issue**, not a security issue — but if you ever change escaping rules in one place and forget the other, you'd have an inconsistency bug. Worth consolidating into `src/utils/escapeHTML.ts`.

**Latent issue — `diff.label` interpolated unescaped:**

- `src/bootstrap/git-diff-page.ts:58,119` — `` `<div class="diff-hunk-header">@@ ${diff.label} @@</div>` ``
- `src/utils/applyDiffHighlights.ts:101` — `` `<span class="diff-tooltip-header">@@ ${diff.label} @@</span>` ``

`diff.label` is built in `src/utils/diffXML.ts:431` as `` `${labelPrefix} · ${tag}${...}` ``, where `tag` is `Element.tagName` from a DOM produced by `DOMParser.parseFromString(xml, "application/xml")` and `labelPrefix` is one of `"measure N"`, `"credit N"`, `"part-list N"`. XML element names cannot legally contain `<`, `>`, `&`, `"`, or `'` per the XML 1.0 NameStartChar / NameChar production — so DOMParser will reject any document where these characters appear in a tag. Result: `diff.label` is effectively safe by data origin.

**However:** the lack of escaping is brittle. If anyone later adds a code path where `labelFor` returns user-supplied text (e.g. a part name, an instrument label), the XSS gap opens silently. **Recommendation:** apply `escapeHTML(diff.label)` at both sites. Cheap, makes the safety property local instead of cross-cutting.

### 2.3 User XML → DOM path

The only place user XML reaches the DOM as parsed markup is `Verovio.toolkit.renderToSVG()`, which produces SVG (not HTML), and `DOMParser.parseFromString(xml, "application/xml")`. Both are safe: SVG executes scripts only when injected into HTML with `innerHTML` and within an `<svg>` containing `<script>` elements — verovio's renderer does not emit `<script>` tags. The `application/xml` parser does not execute embedded scripts.

`new DOMParser().parseFromString(xml, "application/xml")` is used at:
- `src/utils/loadScoreFile.ts:41` (parse `META-INF/container.xml`)
- `src/utils/applyDiffHighlights.ts:256, 306` (parse MEI from Verovio)
- `src/utils/diffXML.ts:683-685` (parse user XML for diff)
- `src/tests/*` (test code)

All correct mode — `"application/xml"`. No `"text/html"` parsing of user XML.

### 2.4 External fetches / WebSockets / XHR

```
$ grep -rn "fetch(\|XMLHttpRequest\|WebSocket\|sendBeacon" src/ --include="*.ts"
(no matches)
```

The only `fetch` in the repo is `scripts/fetch-fixtures.ts:275`, a build-time fixture downloader run manually by the maintainer. Never reaches the production bundle. Confirmed clean.

### 2.5 localStorage

Two keys, both UI state, no PII, neither flows back into `innerHTML`:

| Key | File:Line | Value |
|---|---|---|
| `theme-preference` | `src/components/themeToggle/index.ts:62,91` | `"light"` or `"dark"` (parsed defensively) |
| `difflizst:diff-summary:open` | `src/components/diffSummary/index.ts:39,46` | `"0"` or `"1"` (compared against literal `"0"`) |

Both values are checked against an exhaustive allowlist before use. Safe.

### 2.6 FileReader / `.mxl` upload

`src/utils/loadScoreFile.ts` reads dropped files via `FileReader.readAsText` (xml/musicxml) or `readAsArrayBuffer` (mxl, then `fflate.unzipSync`).

**Finding (low):** No file-size cap. A user can drop a multi-GB `.mxl`; `readAsArrayBuffer` will hold the entire file in memory, then `unzipSync` will synchronously decompress it (potential zip bomb — a 10 MB `.mxl` can decompress to gigabytes). This is local DoS only (the user attacks their own tab), but it deserves an explicit cap.

**Recommendation:** add a sanity cap, e.g.

```ts
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
if (file.size > MAX_FILE_BYTES) throw new Error(`File too large (>${MAX_FILE_BYTES} bytes)`);
```

and after `unzipSync`, verify total uncompressed size before string conversion.

### 2.7 Content-Security-Policy

**No CSP meta tag in `index.html` or any HTTP header.** GitHub Pages does not let you set headers, so the meta-tag route is the only option.

A minimal CSP for this app would look like:

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob:;
  font-src 'self';
  connect-src 'self';
  worker-src 'self' blob:;
  manifest-src 'self';
  base-uri 'self';
  form-action 'none';
  object-src 'none';
  frame-ancestors 'none';
">
```

Blockers to enabling:
- `'wasm-unsafe-eval'` is required for Verovio's WASM module. (Acceptable — narrower than `'unsafe-eval'`.)
- `style-src 'unsafe-inline'` is needed because Verovio injects `<style>` blocks into rendered SVG, Vite injects styles via `<style>` for dev mode, Monaco emits inline styles for theming. Removing this would break rendering. (Acceptable for a no-backend tool with no third-party script surface.)
- `worker-src 'self' blob:` for Monaco's web workers (they're created via `URL.createObjectURL(new Blob([…]))`).
- No `'unsafe-eval'` needed — Vite is in production-build mode on Pages.

No inline event handlers (`onclick=`, `onload=`, etc.) found in `src/` or built `dist/index.html`, so CSP would not break anything in your code. Monaco may use inline event handlers internally; verify with Lighthouse / DevTools console after adding the meta tag.

**Recommendation:** add the meta tag above to `index.html`. Defence-in-depth — turns a future stray innerHTML mistake into a no-op instead of an exploit.

---

## 3. Service Worker / PWA

### 3.1 Scope

- Registration: `dist/registerSW.js:1` — `navigator.serviceWorker.register('/DiffLizst/sw.js', { scope: '/DiffLizst/' })`. Explicit scope at top level.
- Worker file location: `/DiffLizst/sw.js` (same path level as scope) — browser will not restrict scope further.
- Workbox config: `vite.config.ts:84` declares `base: '/DiffLizst/'` and `scope: '/DiffLizst/'` in `VitePWA(...)`. Confirmed correctly pinned.

No SW path leak outside `/DiffLizst/`. Verified.

### 3.2 PWA manifest

`dist/manifest.webmanifest`:
- `start_url: "/DiffLizst/"`
- `scope: "/DiffLizst/"`
- `id: "/DiffLizst/"`

All three correctly under `/DiffLizst/`. Verified.

### 3.3 Workbox internals

`dist/sw.js` uses `s.skipWaiting()` + `s.clientsClaim()` — aggressive activation. This is the Workbox-standard pattern; only a concern if you wanted to support graceful version transitions for long-lived sessions. For a no-state diff tool, this is correct.

Runtime caching only matches `/monaco-editor/` (CacheFirst). No cross-origin endpoints in the cache config. No `importScripts(<external-url>)`. Workbox bundle is local (`workbox-dcde9eb3.js`), no CDN. Clean.

No `innerHTML`, `eval`, or `Function(...)` calls inside `dist/sw.js` or `dist/workbox-*.js`. (Workbox is published by Google Chrome team, well-audited.)

### 3.4 `registerSW.js` is not integrity-checked

`dist/index.html:24` loads `registerSW.js` without a `crossorigin`/`integrity` attribute. Since GH Pages serves your own files from your own repo, the realistic risk is a Pages account compromise — at which point integrity is moot anyway. Acceptable for this threat model.

---

## 4. Dependency Vulnerabilities

`pnpm audit --json` returns 8 advisories, all moderate, all `monaco-editor → dompurify@3.2.7`:

| Advisory | Title | Path | Patched in | Action |
|---|---|---|---|---|
| GHSA-v2wj-7wpq-c8vv | XSS in DOMPurify | monaco-editor → dompurify@3.2.7 | dompurify ≥ 3.3.2 | Wait for Monaco upstream bump |
| GHSA-cjmm-f4jc-qw8r | ADD_ATTR predicate skips URI validation | same | 3.3.2 | same |
| GHSA-cj63-jhhr-wcxv | USE_PROFILES prototype pollution | same | 3.3.2 | same |
| GHSA-39q2-94rc-95cp | ADD_TAGS predicate bypasses FORBID_TAGS | same | 3.3.4 | same |
| GHSA-h7mw-gpvr-xq4m | FORBID_TAGS bypass (function predicate) | same | 3.4.0 | same |
| GHSA-crv5-9vww-q3g8 | SAFE_FOR_TEMPLATES bypass in RETURN_DOM | same | 3.4.0 | same |
| GHSA-v9jr-rg53-9pgp | Prototype pollution → XSS via CUSTOM_ELEMENT_HANDLING | same | 3.4.0 | same |
| GHSA-h8r8-wccr-v5f2 | mutation-XSS via Re-Contextualization | same | 3.3.2 | same |

**Critical context:** Monaco vendors DOMPurify *inside its own source tree* (`node_modules/monaco-editor/esm/vs/base/browser/dompurify/dompurify.js`). It is **not** a real npm dep that can be patched via `pnpm overrides`. You'd have to either:

1. Wait for the next Monaco release that bumps the vendored copy. (Current Monaco `0.55.1` was published 2026-04-23; their last DOMPurify bump cadence has historically been 3–6 months.)
2. Patch Monaco locally via `patch-package` / `pnpm patch`. Heavy maintenance burden for a personal project — not recommended.
3. Accept the advisories and document why. (Recommended.)

**Why exploitability is low for DiffLizst specifically:** Monaco only calls DOMPurify through `vs/base/browser/markdownRenderer.js` (hover tooltips and suggestion docs rendered from Markdown). DiffLizst feeds Monaco only `application/xml` content as model text, not Markdown. The advisories all require attacker-controlled Markdown reaching `DOMPurify.sanitize(html, {...})` with specific options. Our usage path doesn't open that channel.

### 4.1 Direct dependencies — freshness check

All direct deps are actively maintained (last release < 1 year, today is 2026-05-31):

| Package | Version | Last release | Status |
|---|---|---|---|
| `fflate` | 0.8.3 | 2026-05-16 | Active. De-facto zip lib for browsers. |
| `verovio` | 6.2.0 | 2026-05-20 | Active. RISM project, multi-org maintained. |
| `monaco-editor` | 0.55.1 | 2026-04-23 | Active. Microsoft. (Issue: vendored DOMPurify, see above.) |
| `linkedom` | 0.18.12 | 2025-08-21 | Active. (~9 months since last release — within the 1-year line but at the edge; watch for follow-ups.) |
| `vite-plugin-pwa` | 1.3.0 | 2026-05-05 | Active. Vite ecosystem. |
| `@vite-pwa/assets-generator` | 1.0.2 | 2025-10-14 | Active. Same author as vite-plugin-pwa. |
| `vitest` | 4.1.7 | 2026-05-20 | Active. |
| `@playwright/test` | 1.60.0 | 2026-05-31 | Active. Released today. |
| `@biomejs/biome` | 2.4.16 | 2026-05-27 | Active. |
| `typescript` | 6.0.3 | 2026-04-16 | Active. |
| `vite` | 8.0.14 | 2026-05-21 | Active. |
| `vite-plugin-dts` | 5.0.1 | 2026-05-19 | Active. |
| `@types/node` | 25.9.1 | 2026-05-19 | Active. |
| `@types/verovio` | 5.1.0 | 2025-08-03 | Active (~10 months; verovio types don't change often). |
| `@vitest/coverage-v8` | 4.1.7 | 2026-05-20 | Active. |

No deprecated direct deps. No known unmaintained projects.

### 4.2 Transitive sampling

Sampled 10 transitives. One stale:

- **`decode-bmp@0.2.1`** — last release 2022-04-28. Chain: `decode-bmp ← decode-ico ← sharp-ico ← @vite-pwa/assets-generator`. Build-time-only (PWA icon generation), not in the runtime bundle. No known CVEs. Acceptable but worth tracking — `sharp-ico` itself is also showing low activity.

The other 9 sampled (`acorn`, `function.prototype.name`, `is-weakset`, `object-keys`, `set-proto`, `sax`, `flatted`, `picomatch`, `tinyglobby`, `tslib`, `detect-libc`) are all standard, well-maintained.

---

## 5. Supply Chain

### 5.1 Install lifecycle scripts

`package.json` declares no `preinstall`, `postinstall`, or `prebuild` hooks. The only postinstall behaviour comes from `sharp` (native binary download), which is explicitly allowed in `pnpm-workspace.yaml:2`:

```yaml
allowBuilds:
  sharp: true
```

This is minimal — only `sharp` (transitive via `@vite-pwa/assets-generator`, build-only). No other package can run install scripts. Good.

### 5.2 `.npmrc`

```
minimum-release-age=10080
```

7-day minimum release age — defends against typosquats and compromised-release windows. Industry best practice. The constraint correctly blocks fresh-from-the-oven malicious releases. **Strong.**

No alternative registry configured; default `https://registry.npmjs.org/` is used.

### 5.3 GitHub Actions

All `uses:` entries across `.github/workflows/{ci,deploy,release}.yml`:

| Action | Publisher | Note |
|---|---|---|
| `actions/checkout@v4` | GitHub | First-party |
| `actions/setup-node@v4` | GitHub | First-party |
| `actions/upload-artifact@v4` | GitHub | First-party |
| `actions/upload-pages-artifact@v3` | GitHub | First-party |
| `actions/deploy-pages@v4` | GitHub | First-party |
| `pnpm/action-setup@v4` | pnpm (Zoltán Kochan / official org) | Verified publisher |

No unverified or fringe actions. All pinned by major version tag (mutable); for max paranoia these could be pinned by commit SHA — a personal-project trade-off (paranoid SHA pinning means more frequent manual updates). Acceptable as-is.

### 5.4 npm publish flow (`release.yml`)

- `npm publish --access public --provenance` with `id-token: write` permission — uses npm's official provenance flow. **Strong** (cryptographic proof of build origin).
- Two-switch publish gate (`vars.PUBLISH_TO_NPM == 'true'` AND `NPM_TOKEN` present) — prevents accidental publish on stray tag pushes. Correct.

---

## 6. What's Solid

These defences are in place and working:

1. **`escapeHTML` discipline.** Every diff line, summary field, before/after value, and rendered summary item that originates in user XML is routed through an escape function before reaching `innerHTML`. Verified at `git-diff-page.ts:7,33,53,96`, `applyDiffHighlights.ts:96,109,110,112,120`, `diffSummary/index.ts:97,87`.
2. **`DOMParser` strictly in XML mode.** All 5 production-code `parseFromString` calls use `"application/xml"`. Embedded `<script>` tags do not execute when parsed as XML.
3. **No-backend architecture.** Zero runtime network calls — `grep -rn "fetch(\|XMLHttpRequest\|WebSocket" src/` returns nothing. The threat surface is the user's own machine and the files they explicitly drop in.
4. **`minimum-release-age=10080` in `.npmrc`.** 7-day cool-down on new releases. Blocks supply-chain attacks during the window where the npm community typically catches and reports compromised packages. Most projects don't do this.
5. **PWA scope correctly pinned.** Manifest `start_url`, `scope`, `id` and SW registration `scope:` are all explicit `/DiffLizst/`. Service worker file lives at the same path level as scope — no chance of escape.
6. **Single `sharp` install-script allowlist.** `pnpm-workspace.yaml` allows only `sharp` to run install scripts. Every other transitive is install-script-blocked.
7. **First-party GitHub Actions only.** No fringe `uses:` lines. Publish flow uses npm provenance + two-switch gating.
8. **No inline event handlers** anywhere in `src/` or built HTML — adding CSP requires no rewrites.
9. **No `eval`, no `Function(...)`, no `document.write`, no `outerHTML`, no `insertAdjacentHTML` anywhere in `src/`.** The only HTML-injection sink in use is `innerHTML`, and every dynamic instance has been audited.

---

## 7. Top 3 Fix Priorities

1. **Add a Content-Security-Policy meta tag to `index.html`.** (See §2.7 for proposed value.) This is the single highest-leverage hardening you can do — it neutralises any future stray `innerHTML` mistake, blocks third-party script injection if a dependency ever shipped one, and costs you maybe two test-cycles to validate against Verovio/Monaco. **Effort: 30 min. Impact: high.**

2. **Cap user file uploads at ~50 MB and verify uncompressed `.mxl` size before string conversion.** `src/utils/loadScoreFile.ts` currently lets a user freeze their tab with a giant file or a zip bomb. The cap is two lines for the file-size check, plus a small loop summing `entries[name].length` before `strFromU8` for the bomb check. **Effort: 20 min. Impact: medium (UX + DoS).**

3. **`escapeHTML(diff.label)` at the three currently-unescaped injection sites** (`git-diff-page.ts:58,119`, `applyDiffHighlights.ts:101`) and consolidate the duplicate `escapeHTML` into `src/utils/escapeHTML.ts`. Today this is safe by data origin (XML tag names can't contain HTML metacharacters), but the safety is a non-local property that's easy to break later. Make it local. **Effort: 10 min. Impact: low today, prevents future regression.**

Optional follow-ups (not in the top 3 but worth noting):
- Track Monaco for a `dompurify ≥ 3.4.0` bump. Re-run `pnpm audit` after each Monaco release; the 8 advisories should clear in one shot.
- Consider `escapeHTML(composer)` in `scoreLoader/index.ts:376` purely as defence-in-depth — the `Composer` type is safe by construction today but the safety property is implicit.
- Optional: pin GitHub Actions by commit SHA instead of `@v4` tags for stricter supply-chain hygiene. Personal-project trade-off.

---

**Findings by severity: 0 critical, 0 high, 8 moderate (all transitive `monaco-editor → dompurify`, low practical exploitability for this app), 1 low (no file-size cap on uploads), 1 informational (missing CSP meta tag).**
