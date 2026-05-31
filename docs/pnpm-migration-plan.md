# Bun → pnpm Migration Plan

## TL;DR

Replace Bun with pnpm as the package manager + vitest as the test runner. 9 files need updates (package.json, tsconfig.json, 5 test imports, 3 CI workflows, playwright.config.ts, README). Low risk: vitest API is near-identical to bun:test; linkedom polyfill remains unchanged; Vite already present; no bun-specific runtime code in production bundles.

---

## File-by-File Changes

| File | Current State | After Migration | Notes |
|------|---------------|-----------------|-------|
| `package.json` | `"test": "bun test src/tests/"` | `"test": "vitest run src/tests/"` | Replace all 5 bun commands; add vitest + @vitest/ui; add packageManager + engines; drop @types/bun |
| `bunfig.toml` | Exists, configures test preload | DELETE | vitest.config.ts replaces all settings |
| `bun.lock` | Generated lockfile | DELETE | pnpm-lock.yaml generated on first pnpm install |
| `tsconfig.json` | Line 7: `"types": ["vite/client", "bun"]` | `"types": ["vite/client"]` | Remove bun types reference |
| `vite.config.ts` | No changes needed | No changes | Already Vite-native, no Bun imports |
| `vitest.config.ts` | Does not exist | CREATE | Test environment setup: linkedom polyfill, include/exclude patterns |
| `playwright.config.ts` | Line 40: `command: "bun run build && bun run preview --port 4173"` | `command: "pnpm run build && pnpm run preview --port 4173"` | Single line change |
| `README.md` | 8 instances of `bun ...` | Replace with `pnpm ...` | Quickstart, test running, library usage docs |
| `.github/workflows/ci.yml` | 5 Bun setup + command blocks | pnpm + Node.js setup | Replace oven-sh/setup-bun with pnpm/action-setup + actions/setup-node |
| `.github/workflows/deploy.yml` | 2 Bun setup + command blocks | pnpm + Node.js setup | Same pattern |
| `.github/workflows/release.yml` | 4 Bun setup + command blocks | pnpm + Node.js setup | Same pattern |
| `src/bootstrap/html-shell.ts` | Line 128: link to bun.com | Line 128: link to pnpm.io | Update footer reference (cosmetic) |
| `src/tests/setup.ts` | Comment mentions "Bun test" | Update comment | Replace "Bun test environment" with "vitest environment" |
| `src/tests/*.test.ts` (5 files) | `import { describe, expect, it } from "bun:test"` | `import { describe, expect, it } from "vitest"` | Each test file: 1-line import change |
| `tests/e2e/library-export.spec.ts` | Line 25: `execSync("bun run build:lib", ...)` | `execSync("pnpm run build:lib", ...)` | 1-line change |

**Total changes: 9 core files + 7 documentation/comment updates**

---

## Test Runner Switch: Exact Migration

### Test Files Importing `bun:test` (5 total)

All use identical patterns: `import { describe, expect, it } from "bun:test"` → `import { describe, expect, it } from "vitest"`.

#### 1. `src/tests/changeIndex.test.ts` (Line 8)
```diff
- import { describe, expect, it } from "bun:test";
+ import { describe, expect, it } from "vitest";
```

#### 2. `src/tests/applyDiffHighlights.test.ts` (Line 13)
```diff
- import { describe, expect, it } from "bun:test";
+ import { describe, expect, it } from "vitest";
```

#### 3. `src/tests/diffXML.test.ts` (Line 11)
```diff
- import { describe, expect, it } from "bun:test";
+ import { describe, expect, it } from "vitest";
```

#### 4. `src/tests/summariseNoteDiff.test.ts` (Line 8)
```diff
- import { describe, expect, it } from "bun:test";
+ import { describe, expect, it } from "vitest";
```

#### 5. `src/tests/diffXML.integration.test.ts` (Line 12 + fixture loading)
```diff
- import { describe, expect, it } from "bun:test";
+ import { describe, expect, it } from "vitest";
```

**Additional change in diffXML.integration.test.ts (Line 18):**
```diff
+ import { readFileSync } from "node:fs";
  
  const loadFixture = (path: string): Promise<string> =>
-   Bun.file(new URL(path, import.meta.url).pathname).text();
+   readFileSync(new URL(path, import.meta.url).pathname, "utf-8");
```

**No other test-specific API changes:** `describe`, `expect`, `it` are API-compatible. The fixture loading is the only Bun-specific call; vitest relies on Node's `fs` module.

---

## New File: `vitest.config.ts`

Create `/Users/samuelwaiweng.yong/Documents/DiffLizst/vitest.config.ts`:

```typescript
import path from "node:path";
import { defineConfig } from "vitest/config";
import { DOMParser } from "linkedom";

/**
 * Vitest config for DiffLizst unit + integration tests.
 *
 * Mirrors bunfig.toml + src/tests/setup.ts:
 * - Test environment: Node.js with linkedom DOM polyfill
 * - Include: src/tests/*.test.ts and *.integration.test.ts
 * - Exclude: src/scripts/ tests (not part of the app)
 * - Globals: DOMParser, XMLSerializer polyfill (same as setup.ts)
 */

// Polyfill DOM APIs for diffXML.ts tests (same as src/tests/setup.ts)
class XMLSerializerPolyfill {
  serializeToString(node: unknown): string {
    return (node as { toString(): string }).toString();
  }
}

Object.assign(globalThis, {
  DOMParser,
  XMLSerializer: XMLSerializerPolyfill,
});

export default defineConfig({
  test: {
    globals: true,
    environment: "node", // linkedom is pure Node; no jsdom/happy-dom overhead
    include: ["src/tests/**/*.test.ts", "src/tests/**/*.integration.test.ts"],
    exclude: ["src/scripts/**", "node_modules", "dist"],
    // Optional: add reporters for CI
    // reporters: process.env.CI ? ["verbose", "json"] : ["verbose"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
```

---

## Step-by-Step Migration Commands

Run these in order from the repo root. **Do not commit between steps** — all together form one "Bun → pnpm" migration commit.

### Phase 1: Lock file cleanup
```bash
rm bunfig.toml bun.lock
```

### Phase 2: Install pnpm + dependencies
```bash
# Install pnpm globally (one-time; adjust version as needed)
npm install -g pnpm@11.5.0

# Clear any existing node_modules to start fresh
rm -rf node_modules pnpm-lock.yaml

# Generate pnpm-lock.yaml; skip @types/bun (will remove from package.json first)
pnpm install
```

### Phase 3: Update package.json
```bash
# Remove @types/bun
pnpm remove @types/bun

# Add vitest + @vitest/ui + node type definitions
pnpm add -D vitest@^1.0.0 @vitest/ui@^1.0.0

# Verify: package.json should now have vitest instead of @types/bun
# (No cli command needed — manually edit package.json as per the table below)
```

### Phase 4: Update configuration files
```bash
# 1. Delete bunfig.toml (already done in Phase 1)
# 2. Create vitest.config.ts (see "New File" section above)
# 3. Update 5 test imports (see "Test Runner Switch" section)
# 4. Update tsconfig.json: remove "bun" from types array
# 5. Update playwright.config.ts: bun run → pnpm run
# 6. Update README.md: bun ... → pnpm ...
# 7. Update src/tests/setup.ts comment
# 8. Update src/bootstrap/html-shell.ts link
# 9. Update tests/e2e/library-export.spec.ts execSync call
```

### Phase 5: Verify locally
```bash
pnpm typecheck    # Should pass (tsc --noEmit)
pnpm lint         # Should pass (biome check .)
pnpm test         # Should pass (vitest run src/tests/)
pnpm build        # Should pass
pnpm build:lib    # Should pass
pnpm test:e2e     # Should pass (after pnpm run test:e2e:install)
pnpm verify       # Should pass (full gate: lint + typecheck + test + build)
```

---

## package.json Changes (Detailed)

### Scripts section
```diff
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "build:lib": "vite build --mode lib",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
-   "test": "bun test src/tests/",
-   "test:unit": "bun test src/tests/",
+   "test": "vitest run src/tests/",
+   "test:unit": "vitest run src/tests/",
    "test:e2e": "playwright test",
    "test:e2e:install": "playwright install --with-deps chromium",
-   "verify": "bun run lint && bun run typecheck && bun run test:unit && bun run build && bun run build:lib"
+   "verify": "pnpm run lint && pnpm run typecheck && pnpm run test:unit && pnpm run build && pnpm run build:lib"
  },
```

### devDependencies section
```diff
  "devDependencies": {
    "@biomejs/biome": "^2.4.16",
    "@playwright/test": "^1.60.0",
-   "@types/bun": "^1.3.14",
    "@types/verovio": "^5.1.0",
+   "vitest": "^1.0.0",
+   "@vitest/ui": "^1.0.0",
    "linkedom": "^0.18.12",
    "typescript": "^6.0.3",
    "vite": "^8.0.12",
    "vite-plugin-dts": "^5.0.1"
  },
```

### Add packageManager + engines (new fields)
```diff
  "homepage": "https://kangazero.github.io/DiffLizst/",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/KangaZero/DiffLizst.git"
  },
+ "packageManager": "pnpm@11.5.0",
+ "engines": {
+   "node": ">=20",
+   "pnpm": ">=11"
+ },
```

---

## CI Workflow Diffs

### `.github/workflows/ci.yml` — Full Updated Version

```yaml
name: CI

on:
  push:
    branches: ["**"]
  pull_request:
    branches: ["**"]
  workflow_dispatch:

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  lint:
    name: Lint (Biome)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: "11"
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Biome check
        run: pnpm run lint

  typecheck:
    name: Typecheck (tsc --noEmit)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: "11"
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Typecheck
        run: pnpm run typecheck

  test-unit:
    name: Unit + integration tests (vitest)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: "11"
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Run vitest
        run: pnpm run test:unit

  test-e2e:
    name: Playwright e2e (chromium)
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: "11"
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Install Playwright browsers
        run: pnpm dlx playwright install --with-deps chromium
      - name: Build web app + library (so e2e runs against production bundle)
        run: |
          pnpm run build
          pnpm run build:lib
      - name: Playwright tests
        run: pnpm run test:e2e
      - name: Upload Playwright report on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7

  build:
    name: Build (web + library)
    runs-on: ubuntu-latest
    needs: [lint, typecheck, test-unit]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: "11"
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Build web app
        run: pnpm run build
      - name: Build library
        run: pnpm run build:lib
      - name: Upload web bundle
        uses: actions/upload-artifact@v4
        with:
          name: web-dist
          path: dist/
          retention-days: 7
      - name: Upload library bundle
        uses: actions/upload-artifact@v4
        with:
          name: lib-dist
          path: dist-lib/
          retention-days: 7
```

### `.github/workflows/deploy.yml` — Updated build job

```yaml
jobs:
  build:
    name: Build for Pages
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: "11"
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Build
        run: pnpm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
```

### `.github/workflows/release.yml` — Updated verify + publish jobs

```yaml
jobs:
  verify:
    name: Verify (lint + typecheck + tests)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: "11"
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Lint
        run: pnpm run lint
      - name: Typecheck
        run: pnpm run typecheck
      - name: Unit + integration tests
        run: pnpm run test:unit
      - name: Install Playwright browsers
        run: pnpm dlx playwright install --with-deps chromium
      - name: Build (required for e2e library-export test)
        run: |
          pnpm run build
          pnpm run build:lib
      - name: Playwright tests
        run: pnpm run test:e2e

  publish:
    name: Publish to npm
    needs: verify
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: "11"
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          registry-url: "https://registry.npmjs.org"
          cache: "pnpm"
      - name: Install dependencies
        run: pnpm install --frozen-lockfile
      - name: Build library
        run: pnpm run build:lib
      - name: Check if publish is enabled
        id: gate
        run: |
          if [[ "${{ vars.PUBLISH_TO_NPM }}" != "true" ]]; then
            echo "publish=false" >> "$GITHUB_OUTPUT"
            echo "Publish skipped: vars.PUBLISH_TO_NPM is not 'true' (current: '${{ vars.PUBLISH_TO_NPM }}')"
          elif [[ -z "${NPM_TOKEN:-}" ]]; then
            echo "publish=false" >> "$GITHUB_OUTPUT"
            echo "Publish skipped: NPM_TOKEN secret is not set"
          else
            echo "publish=true" >> "$GITHUB_OUTPUT"
            echo "Publish enabled — proceeding"
          fi
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
      - name: Publish to npm
        if: steps.gate.outputs.publish == 'true'
        run: npm publish --access public --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

---

## Acceptance Criteria

After migration, all of the following must pass locally and on CI:

- [ ] `pnpm install` succeeds; produces `pnpm-lock.yaml` (in `.gitignore`)
- [ ] `rm -rf node_modules && pnpm install --frozen-lockfile` works (clean install reproducible)
- [ ] `pnpm typecheck` passes (`tsc --noEmit` with no errors)
- [ ] `pnpm lint` passes (Biome check clean)
- [ ] `pnpm test:unit` passes all 61 vitest tests
- [ ] No test output mentions `Bun` or bun-specific globals
- [ ] `pnpm build` produces `dist/` with identical file count + ~same bundle size
- [ ] `pnpm build:lib` produces `dist-lib/lib.js` and `dist-lib/lib.d.ts`
- [ ] Library `.d.ts` exports match `src/lib.ts` (diffXML, XMLDiffOptions, XMLDiffResult, etc.)
- [ ] `pnpm test:e2e:install && pnpm test:e2e` passes all 8 Playwright specs
- [ ] `pnpm verify` passes (full pre-push gate: lint + typecheck + test + build + build:lib)
- [ ] All 3 GitHub Actions workflows (ci.yml, deploy.yml, release.yml) run green on a test push
- [ ] `bun.lock` is gone; `bunfig.toml` is gone
- [ ] `git diff` shows no accidental unrelated changes (only pnpm-related)

---

## Risks + Watch-outs

### Risk: Low — Package Hoisting Compatibility

**Concern:** pnpm's strict dependency hoisting (no phantom deps) may expose undeclared peer dependencies.

**Mitigation:**
- Test `pnpm install` and `pnpm test` locally before pushing.
- If `verovio` or `monaco-editor` need peer deps declared, add them to `package.json` `peerDependencies` + `devDependencies`.
- Current dependencies (fflate, verovio, monaco-editor) are well-maintained and unlikely to have peer-dep quirks, but run the full test suite to verify.

**Check after migration:**
```bash
pnpm audit
pnpm why verovio    # confirm hoisting is correct
pnpm why monaco-editor
```

### Risk: Low — Test Fixture Path Resolution

**Concern:** `diffXML.integration.test.ts` switches from `Bun.file(...).pathname` to `readFileSync(...)` with `import.meta.url`. Path resolution must remain correct.

**Mitigation:**
- `import.meta.url` is stable in vitest (works identically to Bun).
- Fixtures are at `src/scores/Chopin/*.xml` relative to test file.
- Relative path `"../scores/..."` works in both Bun and vitest node environment.
- Test this first: `pnpm run test:unit -- src/tests/diffXML.integration.test.ts` before full suite.

### Risk: Very Low — DOM Polyfill Stability

**Concern:** linkedom may behave slightly differently under vitest vs Bun's native DOM.

**Mitigation:**
- linkedom is already used in `src/tests/setup.ts` under Bun, so tests already pass with it.
- vitest simply loads it globally the same way `setup.ts` does (both in `vitest.config.ts` now).
- No logic changes to tests; only runner changed.
- If an edge case surfaces, it will show up immediately in the test output.

### Watch-out: CI Caching

**Concern:** GitHub Actions `cache: "pnpm"` directive must be present on every setup-node call.

**Mitigation:**
- All three workflows now include `cache: "pnpm"` on `actions/setup-node@v4`.
- pnpm cache location is automatically detected; no manual `cache-dependency-path` needed.

### Watch-out: Playwright under pnpm

**Concern:** `pnpm dlx playwright install` is slightly slower than `bunx playwright install` (spawns a Node subprocess).

**Mitigation:**
- Negligible performance difference in CI (~2–5 sec overhead).
- CI already has 20-minute timeout for e2e; no issue.

### Watch-out: npm publish during release workflow

**Concern:** `npm publish` still uses npm, not pnpm, to preserve npm's built-in provenance signing.

**Mitigation:**
- This is intentional and correct.
- `NODE_AUTH_TOKEN` env var + `npm publish --provenance` work correctly alongside pnpm installs.
- No change needed here.

---

## Summary of File Changes

**Delete (2 files):**
- `bunfig.toml`
- `bun.lock`

**Create (1 file):**
- `vitest.config.ts`

**Update (9 files):**
- `package.json` (scripts, devDependencies, add packageManager + engines)
- `tsconfig.json` (remove "bun" from types)
- `playwright.config.ts` (bun run → pnpm run)
- `README.md` (8 command + 2 documentation references)
- `.github/workflows/ci.yml` (5 jobs: setup + commands)
- `.github/workflows/deploy.yml` (1 job: setup + commands)
- `.github/workflows/release.yml` (2 jobs: setup + commands)
- `src/tests/setup.ts` (comment only)
- `src/bootstrap/html-shell.ts` (link only)

**1-line import changes (5 test files):**
- `src/tests/changeIndex.test.ts`
- `src/tests/applyDiffHighlights.test.ts`
- `src/tests/diffXML.test.ts`
- `src/tests/summariseNoteDiff.test.ts`
- `src/tests/diffXML.integration.test.ts` (+ 1 fixture loading change)

**1-line change (1 e2e helper):**
- `tests/e2e/library-export.spec.ts`

**Total: 9 core files + 7 comment/doc updates + 5 test imports + 1 e2e change**

---

## Next Steps for Implementer

1. **Phase 1–5 above**: Follow the step-by-step commands and apply all file changes from this document.
2. **Verify locally**: Run `pnpm install && pnpm verify && pnpm test:e2e` — all green.
3. **Single commit**: Combine all changes into one "chore: migrate from Bun to pnpm + vitest" commit.
4. **Push to CI**: Let all 3 workflows run; confirm all jobs pass.
5. **PR review**: This plan is the review reference — each file diff should match above.
6. **Merge**: Once green, merge to main.
