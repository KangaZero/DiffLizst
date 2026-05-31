# DiffLizst v2 — fully-fledged client-side diff + CI + e2e

## Goal

Promote DiffLizst from "refactor-complete prototype" to a **publishable, no-backend MusicXML diff tool** with:

1. A polished, **publishable** browser-native diff core (`diffXML`) exposed as an npm-ready entry point so it can also be consumed as a library.
2. A **GitHub Actions CI pipeline** that gates every push on typecheck → unit/integration tests → Playwright e2e → build, and that publishes on tags (GH Pages for the web app, optional npm for the diff core).
3. **Integration tests** — real fixtures, full diff matrix (all option combinations), regression guards against the bugs already squashed (whitespace normalisation under bun, tooltip memoisation correctness, etc.).
4. **Playwright e2e tests** — drives the actual web app: loads a score, toggles views, asserts overlays / Monaco / git-diff render correctly.

Stack remains binding: TypeScript strict, no `any`, ESM, Bun + Vite, modern deps (< 1y stale).

---

## Investigation summary (what's already there)

| Concern                  | State                                                                                          |
|--------------------------|------------------------------------------------------------------------------------------------|
| Diff engine              | `src/utils/diffXML.ts` — canonical, no-BE, browser-native, fully typed.                        |
| Unit tests               | `src/tests/diffXML.test.ts` — 18 tests passing under `bun test`.                               |
| Bootstrap modularity     | Done. `main.ts` ≈ 350 LOC of wiring + 4 `bootstrap/*.ts` modules.                              |
| Tooltip memoisation      | Done — `WeakMap` cache in `applyDiffHighlights.ts`.                                            |
| CI                       | `.github/workflows/deploy.yml` — GH Pages from `main` only. **No test gate. No e2e. No lint.** |
| Playwright               | **Not installed. Not configured. No tests.**                                                   |
| `package.json` test cmd  | **Wrong — points at the old CLI script, not `bun test`.** Devs run `bun test` manually.        |
| npm publish surface      | None — `private: true`, no `exports`, no library entry.                                        |
| Lint / format            | None — no ESLint, no Prettier, no Biome.                                                       |
| README                   | **Absent.**                                                                                    |

---

## Phases

### Phase 1 — Fix `package.json` test command + add lint/format + library entry

- **Owner**: implementer (this orchestrator)
- **Files**:
  - `package.json` — fix `test` script, add `test:unit`, `test:e2e`, `typecheck`, `lint`, `format`, `release` scripts. Add `exports` block for library consumers. Decide whether to keep `private: true` or remove it for npm publish (keep it — the user can flip when ready to publish; CI workflow handles `npm publish --access public` only on tags).
  - `biome.json` (new) — Biome 1.x for lint + format. Biome is the modern choice, ~10× faster than ESLint+Prettier, single binary, actively maintained (releases monthly). No plugin overhead for a small TS project.
  - `src/lib.ts` (new) — re-exports `diffXML`, `XMLDiffOptions`, `XMLDiffResult`, `ElementDiff`, `DiffLine`, `DiffLineType`, `ChangeType`, `ChildDiffKey` as the library's public surface. Vite already builds the app from `src/main.ts`; the library build is a separate `vite build --mode lib` invocation that consumes `src/lib.ts`.
  - `vite.config.ts` — branch on `mode === 'lib'` to emit a library bundle (ES + types) to `dist-lib/`.
- **Acceptance criteria**:
  - `bun run test:unit` exits 0 with all 18+ tests passing.
  - `bun run typecheck` exits 0.
  - `bun run lint` exits 0 (after fixing whatever Biome flags on first run).
  - `bun run build` produces the web app in `dist/` as before.
  - `bun run build:lib` produces `dist-lib/lib.js` + `dist-lib/lib.d.ts` with the right named exports.

### Phase 2 — Expand integration test coverage

- **Owner**: tester
- **Files**:
  - `src/tests/diffXML.integration.test.ts` (new) — focused on combinations, not single behaviours. Test matrix: every (contextLines × ignoreWhitespace × detailedDiff) combination on the real Chopin/Rachmaninoff fixtures. Plus regression guards for: (a) the bun DOMParser whitespace normalisation fix from `eebd40e`; (b) tooltip identity stability across `runDiff` calls; (c) round-tripping a score against itself never produces non-zero maps.
  - `src/tests/applyDiffHighlights.test.ts` (new) — pure helper tests for `buildMeasureIdMap` and `buildChildIdMap` (DOM-level helpers). Uses linkedom from `setup.ts`.
- **Acceptance criteria**:
  - `bun test src/tests/` exits 0 with all tests passing.
  - Combined coverage exercises ≥ 95% of branches in `diffXML.ts` (best-effort; bun's coverage flag).
  - No flake on 3 consecutive runs.

### Phase 3 — Playwright e2e tests

- **Owner**: tester
- **Files**:
  - `playwright.config.ts` (new) — chromium-only in CI, but matrix-ready for firefox + webkit if the user opts in. Uses `webServer: { command: 'bun run preview', port: 4173 }` so the build is exercised, not just dev. Base URL `http://localhost:4173/DiffLizst/` (matches Vite's `base`).
  - `tests/e2e/diff-flow.spec.ts` (new) — boots the app, waits for verovio WASM ready, asserts:
    1. Two notation panels render SVG.
    2. Overlay highlights appear on at least one measure.
    3. Clicking the Monaco-view toggle shows the editor.
    4. Clicking the git-diff toggle shows hunks.
    5. Score loader swap triggers a re-diff.
    6. Scale slider rescales without breaking overlays.
  - `tests/e2e/library-export.spec.ts` (new) — pure Node test that imports `dist-lib/lib.js` and runs a tiny diff to prove the library entry actually works after build.
  - `tests/e2e/fixtures/` — symlink or copy a couple of the existing `src/scores/**/*.xml` for any fixture-load e2e tests. Or just rely on the in-app score loader populating them via `import.meta.glob` — preferred (no duplication).
  - `.gitignore` — add `test-results/`, `playwright-report/`, `dist-lib/`.
- **Acceptance criteria**:
  - `bun run test:e2e` (which runs `playwright test`) exits 0 on local machine with chromium installed.
  - At least 6 distinct test cases pass.
  - Tests don't rely on `setTimeout` for app-readiness — use Playwright's auto-wait + explicit `waitForFunction` keyed on `window.verovio` or a SVG mounted in the DOM.
  - No `any`. Strict TS types throughout.

### Phase 4 — GitHub Actions CI pipeline

- **Owner**: deployer
- **Files**:
  - `.github/workflows/ci.yml` (new) — runs on every push + PR to any branch. Jobs:
    1. `lint` — bun install + `bun run lint`.
    2. `typecheck` — bun install + `bun run typecheck`.
    3. `test-unit` — bun install + `bun run test:unit`.
    4. `test-e2e` — bun install + `bunx playwright install --with-deps chromium` + `bun run build` + `bun run test:e2e`. Uploads playwright-report on failure.
    5. `build` — `bun run build` + `bun run build:lib`. Uploads `dist/` and `dist-lib/` as artifacts.
  - `.github/workflows/deploy.yml` (rewrite) — runs on push to `main` only, after `ci.yml` passes. Pulls the `dist/` artifact from a fresh build job, uploads to GH Pages. Existing file replaced with a cleaner version that uses the consolidated test gate.
  - `.github/workflows/release.yml` (new) — runs on tags matching `v*`. Builds the library, runs unit + e2e tests as a gate, then `npm publish --access public --provenance` of the diff-core package. Provenance requires `id-token: write`. Publish is gated on a `NPM_TOKEN` secret being present — if absent, the workflow logs "no NPM_TOKEN, skipping publish" rather than failing, so contributors without publish rights can still cut tags.
  - `package.json` — bump the `name` field to a publishable scoped name (e.g. `@kangazero/difflizst-core`) for the library publish. The web app itself stays a private project, but the library lives under the same package.json with `private: false` for publishability; a `files` field whitelists only the library output.
- **Acceptance criteria**:
  - YAML validates (`actionlint` or `bun x @action-validator/core` if available; otherwise visual review).
  - Each job has a `name`, `runs-on`, explicit `permissions` block, and pinned action major versions (`@v4`, `@v5`).
  - No `--no-verify`, no `--force`. No deploy on PR branches.
  - `release.yml` is gated on tag pattern AND `vars.PUBLISH_TO_NPM == 'true'` — a manual switch the user flips when they're ready.

### Phase 5 — Reviewer pass

- **Owner**: reviewer
- Scan for:
  - `any` keyword (zero tolerance).
  - `@ts-ignore` / `@ts-expect-error` without justification.
  - Brittle e2e selectors (anything by index or by raw `textContent` matching localised strings — prefer `getByRole`, `getByTestId`, stable id attributes).
  - Workflow smells: missing concurrency groups, missing `permissions` blocks, unpinned actions, secrets used outside protected env.
  - Dead exports.
  - `console.log` left in production paths.
- Output: PASS or a list of ≤ 5 must-fix items. Re-dispatch implementer if FAIL.

### Phase 6 — Documenter pass

- **Owner**: documenter
- **Files**:
  - `README.md` (new) — sections: what is DiffLizst, screenshot or GIF placeholder, quickstart (`bun install && bun run dev`), test commands (unit + e2e), library usage example with `diffXML(...)`, CI/release workflow explanation, contributing notes.
- **Acceptance criteria**:
  - README exists, ≥ 4 sections, no broken internal links.
  - Library usage example compiles (copy-paste into a new file should typecheck).

### Phase 7 — Commit, tag, push

- **Owner**: git-keeper
- Commit per-phase as we go (not batched). Push after each commit. Branch: `refactor/diff-and-tests`. **No tag in this run** — the user creates the tag when they're ready to cut a release.

---

## Out of scope

- Actually triggering an npm publish (the workflow is added but the publish requires `NPM_TOKEN` + the user flipping the `PUBLISH_TO_NPM` repo variable to `true`).
- Replacing Vite with another bundler.
- Adding visual regression tests for the SVG output (would require pixel snapshots; flake risk too high without a baseline strategy).
- Internationalising strings.

---

## Risk register

- **Playwright in CI under Bun** — `playwright test` runs under Node by default. The Bun runner is not 100% compatible. Decision: invoke Playwright via `bunx playwright test`, which uses bun to install but lets Playwright run its own Node-compatible runner. If that breaks, fall back to `npx playwright test` in CI (CI image has Node by default).
- **Biome vs existing code style** — Biome's default config is opinionated. Run `bunx biome check --apply src/` once and let the implementer commit the auto-fix in its own commit so the diff is reviewable.
- **`vite build --mode lib`** — Vite supports library mode via `build.lib` in config. Branch on `mode` cleanly so the web app build is untouched.
- **`importMeta.url` paths in tests under Playwright** — Playwright's test runner ≠ bun's test runner. Don't share helpers between them without checking which globals each provides.
- **GitHub Pages base path** — the web app is served from `/DiffLizst/`. Playwright's `baseURL` must match or all `page.goto('/')` calls will 404.
