# DiffLizst Refactor + Test Coverage Plan

## Goal

Consolidate two divergent diff engines into one canonical implementation, decompose the monolithic `main.ts` into focused modules, memoize the hot path in `applyDiffHighlights`, purge stale artifact files, and expand `bun test` coverage to exercise the surviving diff engine against real score fixtures.

---

## Investigation findings

### Diff engine canonical: `diffXML.ts`

Evidence (decisive, not a judgment call):

- `src/main.ts` imports only from `diffXML.ts` (via `@/utils/diffXML`).
- `src/utils/applyDiffHighlights.ts` imports only from `./diffXML`.
- `src/components/diffSettings/index.ts` imports only `XMLDiffOptions` from `@/utils/diffXML`.
- `MXMLDiffParser.ts` is **never imported by any browser-side module**. Its only consumers are the two CLI test scripts (`src/tests/MXMLDiffParser.test.ts`, `src/tests/diffToUse.test.ts`) that are explicitly excluded from the `bun run test` script in `package.json`.
- `MXMLDiffParser.ts` wraps `Bun.spawn(['git', ...])` — it is a Bun/Node CLI tool, not a browser engine. It cannot run in the Vite browser bundle and is architecturally incompatible with `diffXML.ts`.
- Git log confirms `MXMLDiffParser.ts` was added in early exploratory commits ("vibe coded") and was never integrated into the main render path.
- `diffXML.ts` is fully typed, uses `DOMParser` (browser-native), has its own passing unit tests (`diffXML.test.ts`), and exports the types used app-wide (`XMLDiffResult`, `ElementDiff`, `ChildDiffKey`, `XMLDiffOptions`).

**Decision: `diffXML.ts` is canonical. `MXMLDiffParser.ts` is a standalone CLI investigation script. It will be moved to `src/scripts/` rather than deleted, since it is not imported by the app and its CLI tests are not run by `bun run test`. The `diffToUse.test.ts` and `MXMLDiffParser.test.ts` files move with it.**

### Existing test coverage gaps

`src/tests/diffXML.test.ts` already covers:

- Identical scores (empty maps)
- Credit-text change
- Measure note-pitch change
- Unchanged measure not flagged
- Added measure (xml2 only)
- Removed measure (xml1 only)
- `contextLines: 0` and `contextLines: 5`
- `ignoreWhitespace` true/false

Missing:

- Scores that are wildly different (many measures changed, cross-composer fixture: Chopin vs Rachmaninoff)
- `detailedDiff: true` mode (children map populated, measures map empty)
- `partLists` diff detection
- Credit-only diff (no measure changes)
- Measure-only diff (no credit changes)
- Child-only diff (detailedDiff mode, note/rest level)
- Full-fixture smoke test (Chopin Op10No1 vs Op10No2, Rachmaninoff Op23No5 vs Op23No5V2) confirming non-zero diff maps and no thrown errors

### main.ts current responsibilities

1. Monaco environment + worker bootstrap (global `self.MonacoEnvironment`)
2. Static HTML shell injection (`app.innerHTML = ...`)
3. DOM element queries and null-guard
4. Pagination component creation and wiring
5. Score loader component wiring + sample list population
6. Mutable rendering state declarations (`originalXML`, `xmlDiff`, `currentSettings`, id maps)
7. Theme media-query listener (partially dead-coded)
8. Scale helper functions (`updateScaleOutput`, `rescale`)
9. Diff orchestration (`reapplyDiff`, `runDiff`, `reloadScore`)
10. Monaco diff editor lifecycle (`renderCodeDiffPage`, `syncFromMonaco`, `getMonacoTheme`, `debounce`, edit-toggle listener)
11. Git diff page rendering (`renderGitDiffPage`, `escapeHTML`, `splitCellHTML`, `unifiedHunkHTML`, `splitHunkHTML`, `splitToggle` listener)
12. View-switch logic (`switchView`, `activeView`, toolbar button listeners)
13. Diff overlay → Monaco navigation (`labelToSearchTerm`, `navigateMonacoToDiff`, `diff-navigate` listener)
14. Scale event listeners (shared + per-score)
15. Diff settings listener
16. Page-change listeners
17. Verovio WASM `onRuntimeInitialized` callback + initial render

### applyDiffHighlights hot path

`applyDiffHighlights` is called on every scale change, page turn, and settings change. On each call it:

1. Removes all existing `.diff-overlay` nodes (cheap DOM ops).
2. Iterates every `g.measure` in the current SVG and resolves each to a measure number via `measureIdToNum` (O(n) map lookups).
3. For each changed measure, calls `createOverlay`, which calls `buildTooltipHTML` — this re-serialises the `ElementDiff.lines` array into an HTML string from scratch on every call.
4. Repeats the same `buildTooltipHTML` call for credits and child diffs.

**Stable across renders (only changes when `xmlDiff` changes):** The `ElementDiff.lines` array content and therefore the tooltip HTML. `buildTooltipHTML(diff, showLineNumbers)` is pure: same inputs → same output.

**Re-computed unnecessarily:** The tooltip HTML string is rebuilt for every overlay on every re-render, even when neither the diff result nor the `showLineNumbers` setting has changed. Caching tooltip HTML per `(diff, showLineNumbers)` pair eliminates this redundant work.

---

## Phases

### Phase 1 — Relocate MXMLDiffParser to scripts; delete stale notes

- **Owner specialist:** implementer
- **Files touched**:
  - `src/scripts/MXMLDiffParser.ts` (move from `src/utils/MXMLDiffParser.ts`)
  - `src/scripts/MXMLDiffParser.test.ts` (move from `src/tests/MXMLDiffParser.test.ts`)
  - `src/scripts/diffToUse.test.ts` (move from `src/tests/diffToUse.test.ts`)
  - `src/utils/MXMLDiffParser.ts` (delete)
  - `src/tests/MXMLDiffParser.test.ts` (delete)
  - `src/tests/diffToUse.test.ts` (delete)
  - `/diff.md` (delete — ANSI-escaped terminal dump, no informational value beyond the score fixtures)
  - `/src/diff.md` (delete — identical terminal dump)
- **What changes**: Move the git-backed CLI scripts to a `src/scripts/` folder that is clearly not part of the browser bundle. Delete the two artifact diff dumps. Update the internal import in `src/scripts/MXMLDiffParser.test.ts` and `src/scripts/diffToUse.test.ts` from `@/utils/MXMLDiffParser` to a relative path `../scripts/MXMLDiffParser` (or keep `@/` alias — tester to confirm which resolves under `bun` without Vite). The `src/utils/` folder is now `diffXML.ts`-only as the canonical engine. The `package.json` `test` script does not reference these files, so no script changes needed.
- **Acceptance criteria**:
  - `bun run build` passes with no TypeScript errors (no orphaned imports — confirmed by import-graph analysis above).
  - `bun run test` passes (runs `src/tests/diffXML.test.ts` only; MXMLDiffParser tests are not in that script).
  - `src/utils/MXMLDiffParser.ts` no longer exists on disk.
  - `/diff.md` and `/src/diff.md` no longer exist on disk.
  - `src/scripts/MXMLDiffParser.ts` exists and is importable by the scripts.
- **Risk**: The `@/` path alias is defined in Vite's config and in `tsconfig.json` `paths` but Bun resolves it via `tsconfig.json` `paths` when running scripts directly. The moved scripts use `@/utils/MXMLDiffParser` which will break if Bun does not pick up the alias. Mitigation: switch the import inside the moved scripts to a relative path `./MXMLDiffParser` since they now live in the same directory.
- **Rollback**: `git revert <phase 1 commit>` restores all deleted/moved files atomically.

---

### Phase 2 — Expand diffXML test coverage

- **Owner specialist:** tester
- **Files touched**:
  - `src/tests/diffXML.test.ts` (extend — add new `describe` blocks; do not modify existing tests)
- **What changes**: Add test cases for:
  1. **Wildly different scores** — import Chopin `etudeOp10No1.xml` vs Rachmaninoff `op23no5.xml` via `Bun.file(...).text()`, assert `measures.size > 0` and no thrown error.
  2. **Credit-only diff** — use `makeXML` fixture with identical measures but different `creditText`; assert `credits.size === 1` and `measures.size === 0`.
  3. **Measure-only diff** — use `makeXML` fixture with identical credit but different `measure1Note`; assert `measures.size === 1` and `credits.size === 0`.
  4. **detailedDiff mode** — same note change but with `detailedDiff: true`; assert `measures.size === 0` and `children.size > 0`.
  5. **Child-only diff** — detailedDiff mode, assert at least one key in `children` matching the note tag pattern `"1-note-0"`.
  6. **Chopin Op10No1 vs Op10No2 fixture smoke test** — load both files, run diff, assert `measures.size > 0` (real scores with known differences).
  7. **Rachmaninoff Op23No5 vs Op23No5V2 fixture smoke test** — same pattern.
  8. **partLists diff** — `makeXML` variant with different `<part-name>` content; assert `partLists.size === 1`.

  Fixtures are loaded using `Bun.file(new URL('../scores/...', import.meta.url).pathname).text()` — no mocking, real XML.

- **Acceptance criteria**:
  - `bun test src/tests/diffXML.test.ts` exits 0 with all new and existing tests passing.
  - `bun run build` still passes (test file has no runtime imports that could affect the bundle).
  - Test file remains under 300 LOC (use `makeXML` helper for synthetic fixtures; only the smoke tests read from disk).
- **Risk**: `Bun.file` path resolution relative to a test file that runs from the project root may differ from a browser context. Use `import.meta.url` or `import.meta.dir` (Bun-specific) to construct absolute paths to the score fixtures. The implementer should verify this pattern works before writing all eight tests.
- **Rollback**: `git revert <phase 2 commit>` — no production code changed.

---

### Phase 3 — Decompose main.ts into focused bootstrap modules

- **Owner specialist:** implementer
- **Files touched** (create new, then edit `main.ts`):
  - `src/bootstrap/monaco-glue.ts` (new)
  - `src/bootstrap/view-switch.ts` (new)
  - `src/bootstrap/diff-orchestration.ts` (new)
  - `src/bootstrap/score-loading.ts` (new)
  - `src/bootstrap/rendering.ts` (new)
  - `src/main.ts` (reduce to thin entry point — keep only the HTML shell, DOM queries, WASM callback, and top-level wiring that calls into the bootstrap modules)
- **What changes**:

  **`src/bootstrap/rendering.ts`** — exports: `renderNotation`, `rescale`, `updateScaleOutput`. Has no state; receives toolkit and DOM references as parameters.

  **`src/bootstrap/score-loading.ts`** — exports: `reloadScore`. Receives mutable state refs (wrapped as a context object or passed by reference) and the DOM refs it needs. Imports from `rendering.ts` and `diff-orchestration.ts`.

  **`src/bootstrap/diff-orchestration.ts`** — exports: `runDiff`, `reapplyDiff`. Holds (or receives) the mutable `xmlDiff` ref and the id maps. Imports `diffXML`, `applyDiffHighlights`.

  **`src/bootstrap/monaco-glue.ts`** — exports: `renderCodeDiffPage`, `syncFromMonaco`, `getMonacoTheme`. Owns the `monacoDiffEditor` singleton and the `debounce` helper. Imports from `diff-orchestration.ts` for re-diff on edit.

  **`src/bootstrap/view-switch.ts`** — exports: `switchView`. References the DOM sections and both the Monaco and git-diff render functions. Imports `renderCodeDiffPage` from `monaco-glue.ts` and `renderGitDiffPage`. Note: `renderGitDiffPage` and its HTML helpers (`escapeHTML`, `splitCellHTML`, `unifiedHunkHTML`, `splitHunkHTML`) can live in `view-switch.ts` or a sibling `src/bootstrap/git-diff-page.ts` — implementer's call based on line count (aim for ≤ 200 LOC per module).

  **`src/main.ts`** — reduced to: imports, HTML shell injection, DOM queries, pagination/score-loader wiring, scale listeners, diff-settings listener, page-change listeners, `self.MonacoEnvironment` setup, and the `verovio.module.onRuntimeInitialized` callback that delegates to bootstrap functions.

  The dead-coded theme block (commented-out `applyTheme` functions) is removed.

  **No new exports are added to files outside `src/bootstrap/`.** Types that need to cross modules are already exported from `src/utils/diffXML.ts` and `src/components/diffSettings/index.ts`.

- **Acceptance criteria**:
  - `bun run build` passes with no TypeScript errors.
  - `bun run test` passes.
  - `main.ts` is ≤ 200 LOC.
  - Each `src/bootstrap/*.ts` module is ≤ 220 LOC.
  - Manual browser check: `bun run dev`, open browser, verify: (1) notation overlay view loads with diff highlights on page 1; (2) scale slider rescales both scores and re-applies overlays; (3) pagination "next" / "prev" buttons work on both scores; (4) Monaco view toggle shows the diff editor; (5) git diff view toggle shows hunked diff; (6) score-loader dropdown swaps a score and triggers a re-diff; (7) diff settings gear changes context lines and re-renders overlays.
- **Risk**: The mutable state shared between modules (`originalXML`, `xMLToCompare`, `toolkit`, `toolkit2`, `xmlDiff`, `currentSettings`, id maps, `activeView`) must be passed consistently. Using a shared mutable context object avoids prop-drilling but risks hidden coupling. The implementer should define a `RenderState` interface in `src/bootstrap/rendering.ts` and pass it explicitly rather than using module-level variables across bootstrap files.
- **Rollback**: `git revert <phase 3 commit>`. Phase 3 is self-contained — no other source files are changed.

---

### Phase 4 — Memoize tooltip HTML in applyDiffHighlights

- **Owner specialist:** implementer
- **Files touched**:
  - `src/utils/applyDiffHighlights.ts` (edit only)
- **What changes**:

  Add a module-level `WeakMap`-backed or `Map`-backed cache keyed on `(ElementDiff, showLineNumbers)`. Because `ElementDiff` objects are re-created on every `runDiff` call (they are plain objects returned from `diffXML`), a `WeakMap` keyed directly on the object is appropriate: entries are GC'd when the diff result is replaced, so the cache never grows stale.

  Concretely:

  ```
  const tooltipCache = new WeakMap<ElementDiff, { withLineNos: string; withoutLineNos: string }>();
  ```

  `buildTooltipHTML(diff, showLineNumbers)` is wrapped to check the cache before computing. On a cache miss it computes both variants (`showLineNumbers = true` and `false`) and stores both, since the same diff object may be queried with either flag during the same session without a re-diff in between. On hit it returns the cached string.

  The cache is not cleared manually — `WeakMap` semantics guarantee entries are released when `xmlDiff` (the owner of `ElementDiff` objects) is replaced by the next `runDiff` call.

  The `console.log("diff", diff)` statement on line 303 of `applyDiffHighlights.ts` is removed (it is a debug trace with no production value and violates the "no comments unless WHY is non-obvious" convention applied to logs).

- **Acceptance criteria**:
  - `bun run build` passes.
  - `bun run test` passes.
  - Manual browser check: `bun run dev`, open DevTools Performance panel, record a scale-slider drag (5+ notches). Confirm overlays re-appear correctly and no visual regression in tooltip content on measures/credits/children. Verify that `buildTooltipHTML` is not called more than once per `ElementDiff` per `runDiff` cycle (add a temporary `console.count` inside `buildTooltipHTML` during verification, remove before committing).
- **Risk**: If `applyDiffHighlights` is ever called with a new `showLineNumbers` value while `xmlDiff` has not changed (possible if a settings change toggles line numbers without triggering a full re-diff), the cache must hold both variants. The two-slot cache design above handles this. Implementer must verify the settings change path triggers `runDiff` (which replaces `ElementDiff` objects) vs calling `reapplyDiff` directly (which does not). Current code: `settings-change` calls `runDiff`, which replaces `xmlDiff`, which replaces all `ElementDiff` objects — so the cache is implicitly invalidated. This is safe.
- **Rollback**: `git revert <phase 4 commit>`.

---

## Risks

- **Bun path alias resolution for moved scripts (Phase 1)**: `@/` is configured in `tsconfig.json` `paths`, which Bun reads. However, the CLI scripts also use `Bun.file(xmlFilePath)` with absolute paths from `process.argv`, so the alias concern is only for the import statement. Switching to a relative import in the moved scripts eliminates the dependency entirely. Low impact if handled upfront.

- **Shared mutable state across bootstrap modules (Phase 3)**: `main.ts` currently uses 14+ module-level mutable variables that multiple functions read and write. Decomposing without a clear ownership model risks subtle bugs where a module reads a stale variable. The `RenderState` context-object pattern is the mitigation; the reviewer should verify every variable has exactly one owning module.

- **WeakMap cache and ElementDiff identity (Phase 4)**: The cache works only if the same `ElementDiff` object reference is used across multiple `applyDiffHighlights` calls within one diff session. Confirm that `runDiff` produces new `ElementDiff` objects (it does — `diffXML` constructs new plain objects each call) and that between `runDiff` calls the same references are reused (they are — stored in `xmlDiff` maps). If the implementer ever spreads or copies `ElementDiff` objects before passing them to `applyDiffHighlights`, the cache will miss. This is a code-review checkpoint, not a runtime risk.

- **Test fixture DOMParser availability under Bun (Phase 2)**: `diffXML.ts` uses `DOMParser` and `XMLSerializer`, which are browser globals. Bun 1.x ships a DOM implementation (via `@types/bun` and the `dom` lib), but the existing `diffXML.test.ts` already passes under Bun, confirming these globals are available. New tests that call `diffXML` with real XML will inherit the same environment. Low risk.

- **main.ts decomposition scope creep (Phase 3)**: At ~1100 LOC with 14 responsibilities, phase 3 is the largest phase by line count even though it is a pure refactor. The reviewer should insist that no logic is changed — only moved. Any bug discovered during the move should be a separate commit. The acceptance criterion of `bun run build` + manual browser check covers regression.

---

## Out of scope

- Adding new diff features (e.g. timeline/rewind, git commit comparison UI).
- CSS or visual design changes beyond what is strictly necessary for the refactor.
- Converting `MXMLDiffParser.ts` (now in `src/scripts/`) into a browser-compatible engine — it remains a Bun CLI tool.
- Automated end-to-end browser tests (Playwright/Puppeteer) — not in the stack and would add a dev dependency.
- Performance profiling of `diffXML` itself (LCS is O(m×n) and acceptable for per-element XML; full-document diffing is explicitly guarded against in the code comments).
- Migrating the `package.json` `test` script to a `bun test` glob pattern — the current explicit-path invocation is intentional and not broken.
