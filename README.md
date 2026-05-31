# DiffLizst

> Structural diff for MusicXML scores. Runs entirely in your browser — no
> server, no upload, no waiting on a backend.

DiffLizst takes two MusicXML files and shows you which measures, credits,
notes, and parts changed between them. It renders both scores with
[Verovio](https://www.verovio.org/), overlays change-highlights directly on
the engraving, and lets you flip into a Monaco-powered raw diff or a
git-style unified diff with one click.

The same diff core ships as `@kangazero/difflizst-core` for embedding into
your own tools.

[![CI](https://github.com/KangaZero/DiffLizst/actions/workflows/ci.yml/badge.svg)](https://github.com/KangaZero/DiffLizst/actions/workflows/ci.yml)
[![Deploy](https://github.com/KangaZero/DiffLizst/actions/workflows/deploy.yml/badge.svg)](https://kangazero.github.io/DiffLizst/)

---

## Quickstart (web app)

```sh
pnpm install
pnpm dev
```

Then open `http://localhost:5173/DiffLizst/`. Two Chopin études load by
default — use the score-loader dropdowns or drop your own `.xml` /
`.musicxml` files to diff anything else.

To produce a production build:

```sh
pnpm run build      # → dist/ — what GitHub Pages serves
pnpm run preview    # serves dist/ locally on :4173 for sanity check
```

## Using the diff core as a library

```sh
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
  detailedDiff: false,
};

const result = diffXML(oldXml, newXml, opts);

for (const [measureNumber, diff] of result.measures) {
  console.log(`measure ${measureNumber}: ${diff.changeType}`);
  for (const line of diff.lines) {
    console.log(`  ${line.type}: ${line.content}`);
  }
}
```

The library is **browser-native** — it uses `DOMParser` and `XMLSerializer`
from the browser globals. To use it under Node or Bun, polyfill those (we
recommend [linkedom](https://github.com/WebReflection/linkedom), which is
what our own vitest tests use; see `src/tests/setup.ts` for a 12-line
adapter).

### Public API surface

| Export             | Type      | Description                                                  |
|--------------------|-----------|--------------------------------------------------------------|
| `diffXML`          | function  | Diff two MusicXML strings; returns `XMLDiffResult`.          |
| `XMLDiffOptions`   | type      | Inputs: `contextLines`, `ignoreWhitespace`, `algorithm`, `detailedDiff`. |
| `XMLDiffResult`    | type      | Maps of `measures`, `credits`, `partLists`, `children`.      |
| `ElementDiff`      | type      | Per-element diff result: `changeType`, `label`, `lines[]`.   |
| `DiffLine`         | type      | Discriminated union of `add` / `remove` / `context` lines.   |
| `DiffLineType`     | type      | `"add" \| "remove" \| "context"`.                            |
| `ChangeType`       | type      | `"add" \| "remove" \| "change"`.                             |
| `ChildDiffKey`     | type      | Map key shape for `detailedDiff: true` child diffs.          |

## Running the tests

DiffLizst has two test suites that run independently.

### Unit + integration (vitest)

```sh
pnpm run test:unit
```

61 tests covering the diff core: option-matrix combinations against real
score fixtures, regression guards for past whitespace and identity bugs,
and pure DOM-helper unit tests.

### Playwright e2e

First time only (downloads ~100 MB of chromium):

```sh
pnpm run test:e2e:install
```

Then:

```sh
pnpm run test:e2e
```

8 specs drive the actual built bundle via `pnpm run preview`: app boots,
verovio renders, overlay highlights appear, Monaco and git-diff toggles
work, scale slider re-applies overlays, settings re-render correctly, and
the library bundle imports cleanly from `dist-lib/`.

### Run everything (the pre-push gate)

```sh
pnpm run verify     # lint + typecheck + unit + build + build:lib
```

(e2e is intentionally not in `verify` — it takes ~30 s and requires
chromium installed; run it explicitly before opening a PR.)

---

## Project layout

```
src/
├── main.ts                   # entry point — DOM wiring only
├── lib.ts                    # public library entry (re-exports diffXML)
├── bootstrap/                # focused init modules pulled out of main.ts
├── components/               # web components (themeToggle, pages, scoreLoader, diffSettings)
├── utils/
│   ├── diffXML.ts            # the diff engine
│   ├── applyDiffHighlights.ts# SVG overlay renderer
│   └── …                     # small helpers
├── scores/                   # sample MusicXML fixtures
└── scripts/                  # offline / CLI tooling (not bundled)

tests/
└── e2e/                      # Playwright specs

src/tests/                    # vitest specs (unit + integration)
```

`tsconfig.json` excludes `src/scripts/` and `src/commands/` from the
project build — they're investigation-era utilities, not shipped code.

## CI / release flow

Three workflows live under `.github/workflows/`:

- **`ci.yml`** — runs on every push and PR. Five independent jobs: lint
  (Biome), typecheck (`tsc --noEmit`), unit tests (`vitest`), Playwright
  e2e (chromium), and a build that uploads `dist/` and `dist-lib/` as
  artifacts. Each red signal points at one stage.
- **`deploy.yml`** — runs on push to `main`. Builds and deploys the web
  app to GitHub Pages. Concurrency-grouped so deploys never overlap.
- **`release.yml`** — runs on tags matching `v*`. Re-runs the full CI
  gate, builds the library, and publishes to npm **only if both**
  `vars.PUBLISH_TO_NPM == 'true'` (a repo variable) **and** `NPM_TOKEN`
  (a repo secret) are set. If either is missing it logs `publish
  skipped` and exits 0, so tag-pushing is non-destructive by default.

### Cutting a library release

1. Bump `version` in `package.json`.
2. `git commit -am 'release: vX.Y.Z'` and push.
3. `git tag vX.Y.Z && git push --tags`.
4. The release workflow runs the verify suite. If you've set the
   `PUBLISH_TO_NPM` repo variable to `true` and added an `NPM_TOKEN`
   secret, it publishes; otherwise it dry-runs.

## Stack

- TypeScript 6 (strict, no `any`).
- [pnpm 11](https://pnpm.io/) for package management.
- [Vite 8](https://vitejs.dev/) for the web app and library builds.
- [Verovio 6](https://www.verovio.org/) for engraving the SVG scores.
- [Monaco Editor 0.55](https://microsoft.github.io/monaco-editor/) for the raw-diff view.
- [Biome 2](https://biomejs.dev/) for lint + format.
- [Playwright 1.60](https://playwright.dev/) for end-to-end testing.
- [Vitest 4](https://vitest.dev/) for unit + integration tests.
- [linkedom](https://github.com/WebReflection/linkedom) for DOM polyfills under vitest's Node environment.

## License

MIT — see `LICENSE`.
