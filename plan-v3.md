# DiffLizst plan-v3

Run target: branch `refactor/diff-and-tests`. Eight locked items (A–H) grouped
into four execution phases. Items that share write targets are serialised;
items on disjoint files fan out.

## Item file-touch matrix

| Item | Title                              | Primary write targets                                                                 |
|------|------------------------------------|----------------------------------------------------------------------------------------|
| A    | Scale slider visual fix            | `src/style.css`                                                                        |
| B    | Detailed-diff ON + relabel         | `src/components/diffSettings/index.ts`, related unit tests                             |
| C    | File upload (drop + click)         | `src/main.ts`, `src/bootstrap/html-shell.ts`, `src/bootstrap/notation-pipeline.ts`, new `src/components/fileDrop/`, `src/style.css`, `package.json` (fflate) |
| D    | Next/prev change navigation        | `src/main.ts`, `src/bootstrap/notation-pipeline.ts`, new `src/utils/changeIndex.ts`, `src/style.css` |
| E    | Diff summary sidebar               | `src/main.ts`, `src/bootstrap/html-shell.ts`, new `src/components/diffSummary/`, `src/style.css` |
| F    | Within-note diff summary           | `src/utils/diffXML.ts`, `src/utils/applyDiffHighlights.ts`, `src/types/`, unit tests   |
| G    | Page footer                        | `src/bootstrap/html-shell.ts`, `src/style.css`, `vite-env` for version injection       |
| H    | A11y + responsive cross-cut        | `src/style.css`, every component touched in C/D/E/G, Playwright specs                  |

Critical overlap nodes:
- `src/main.ts` — C, D, E (serial)
- `src/style.css` — A, C, D, E, G, H (serial; H folds into each)
- `src/bootstrap/html-shell.ts` — C, E, G (serial)
- `src/utils/diffXML.ts` — F (sole writer)
- `src/components/diffSettings/index.ts` — B (sole writer)

## Phase plan

### Phase 1 — independent fixes (parallel, 3 agents)
Goal: knock out items with disjoint write targets in one fan-out.

- **1a. Item A** — fix `.notation-stage svg` CSS so Verovio `scale` is visible.
  Acceptance: changing slider visibly resizes SVG bounding box at both
  desktop and 390px viewport. No regression on overflow scroll.
- **1b. Item B** — flip `DEFAULT_SETTINGS.detailedDiff` to `true`, rename
  label to "Highlight each note (vs. whole measure)". Update affected
  unit/e2e tests. Acceptance: `bun test` and `playwright test` both pass.
- **1c. Item F (engine half)** — add `summary` field to `ElementDiff` type,
  implement note-child walker producing `{ field, before, after }[]` for
  pitch (step/octave/alter), duration, voice, type, stem, lyric. Add unit
  tests in `src/tests/`. Do NOT touch tooltip rendering yet (that's Phase
  2 to avoid colliding with applyDiffHighlights rewrites).
  Acceptance: ≥9 new unit tests, all green; existing 61 tests still pass.

Gate before Phase 2: typecheck + lint + unit clean.
Commit: one commit per item, push each.

### Phase 2 — main.ts feature stack (serial within phase, 1 agent)
Single implementer agent owns `main.ts` end-to-end to avoid merge thrash.
Order matters: C builds the upload pipeline that D and E both consume.

- **2a. Item C** — file upload (drop + click) for two slots. Use `fflate`
  for `.mxl` (justify: 8KB, zero deps, weekly downloads ~5M, last release
  within 90 days, de facto standard). Wire into existing `reloadScore`.
  Acceptance: drag-drop a `.musicxml`, `.xml`, and `.mxl` each load and
  diff renders. Keyboard Enter/Space opens picker.
- **2b. Item F (UI half)** — render `summary[]` at top of diff tooltip
  via `applyDiffHighlights.ts`. Acceptance: hovering a changed note shows
  human summary above raw diff lines.
- **2c. Item D** — next/prev nav. New `src/utils/changeIndex.ts` flattens
  `xmlDiff.measures ∪ credits ∪ partLists ∪ children` into an ordered
  array. Keyboard `j`/`k`/Arrow handlers + toolbar buttons + "N of M"
  readout. Pulse animation respects `prefers-reduced-motion`.
- **2d. Item E** — diff summary sidebar (collapsible `<aside>`). Counts,
  filter chips, click-to-focus, localStorage persistence.
- **2e. Item G** — page footer with repo link, version from
  `package.json` via Vite `define`, credit links with
  `rel="noopener noreferrer"`.

Gate: typecheck + lint + unit + e2e all green.
Commits: one per sub-item (5 commits). Push each.

### Phase 3 — a11y + responsive cross-cut (1 agent, holistic)
Item H applied across everything Phase 1+2 produced.

- Stack notation panels vertically below 900px.
- 44×44 touch targets, visible accent-coloured focus rings.
- ARIA on drop zones, sidebar, dynamic regions.
- WCAG AA contrast audit on overlay + tooltip in both themes.
- `prefers-reduced-motion` honoured in pulse + transitions.
- Playwright viewports: iPhone 13 (390×844) + desktop (1440×900).

Acceptance: new Playwright cases pass on both viewports;
`@axe-core/playwright` (justified: official a11y testing lib, active,
zero-dep peer) reports no serious/critical violations.

Gate: e2e green at both viewports + axe clean.
Commit: one commit. Push.

### Phase 4 — tester top-up + reviewer + documenter
Sequenced, but tester and documenter run in parallel (disjoint files).

- **4a. Tester** — write any e2e gaps the implementer phases missed
  (file drop via `setInputFiles`, next/prev keyboard, summary click,
  scale slider bounding-box assertion, mobile vertical stack, footer
  link visibility). Target: ≥80% acceptance criteria coverage.
- **4b. Documenter (parallel with 4a)** — update README with upload
  flow, keyboard shortcuts, mobile behaviour, accessibility statement.
- **4c. Reviewer (after 4a + 4b)** — quality gate. Flag any `any`,
  brittle selectors, missing types, ARIA gaps, contrast issues, dead
  code. Verify scale CSS fix actually visible.

Gate: reviewer PASS or ≤3 deferrable minors.
Commits: one for tests, one for docs. Push each.

## Parallelism budget

Phase 1 fans to 3 agents. Phase 2 is single-agent serial (main.ts is the
bottleneck). Phase 3 single agent. Phase 4 fans to 2 then 1.

Peak: 3 concurrent. Below the 5-agent target but constrained by
file-overlap reality of this codebase.

## New dependencies (must justify)

- `fflate` — `.mxl` zip decompression. Active (last release within 90
  days), 8KB, zero runtime deps, used by Excalidraw + Figma. No
  alternative meets the size/maintenance bar.
- `@axe-core/playwright` (dev only) — accessibility assertions in e2e.
  Maintained by Deque, the team behind axe-core. Active monthly
  releases.

Both added in their respective phases, not up-front.

## Hard rules in force

- Branch lock: `refactor/diff-and-tests` only. Never main/release/dev.
- No `any`. `unknown` only as last resort.
- No `--no-verify`, no `--force`. Push every commit.
- One commit per logical feature. Conventional commits. Subject < 72.
- Don't kill dev server `b0i7oaivh`. Agents needing a server start
  their own port.
