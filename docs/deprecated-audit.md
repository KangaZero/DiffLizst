# Deprecated API Audit

Audit scope: all `.ts`, `.css`, `.json`, `.yml` files under `src/**`, `tests/**`,
`scripts/**`, `.github/workflows/**`, `vite.config.ts`, `tsconfig.json`,
`biome.json`, `playwright.config.ts`, `package.json`.

---

## Summary

| Status | Count |
|--------|-------|
| Patterns audited | 29 |
| Deprecated hits found | 11 |
| Fixed in-place | 2 |
| Deferred (off-limits files) | 9 |

---

## Fixed in Place

### 1. `child.ELEMENT_NODE !== 1` (logic bug / legacy Node constant misuse)

**File:** `src/utils/setNotationSVGIDToIndexBase.ts:14`

`Node.ELEMENT_NODE` is a static constant equal to `1`. Reading it via an
instance (`child.ELEMENT_NODE`) returns the same constant — always `1`. So
`child.ELEMENT_NODE !== 1` is always `false`, meaning the non-element guard
never fired and every child node (including `Text` and `Comment` nodes) was
cast to `HTMLElement` and checked for `.tagName`. In practice this only
caused silent no-ops rather than a crash, but it is conceptually wrong and
would break under any DOM implementation that doesn't expose the constant on
prototype instances.

```diff
- if (child.ELEMENT_NODE !== 1) return;
+ if (child.nodeType !== Node.ELEMENT_NODE) return;
```

The correct check compares `child.nodeType` (the per-node instance value that
actually varies) against `Node.ELEMENT_NODE` (the static constant).

---

### 2. `String.prototype.substring` → `slice` (MDN-deprecated)

**File:** `src/scripts/MXMLDiffParser.ts:88`

`substring` is not formally removed but MDN marks it as legacy. Its edge
cases differ from `slice` when arguments are negative (it swaps them instead
of clamping), making it a subtle footgun. `slice` is the modern unambiguous
replacement.

```diff
- content: line.substring(1), // Remove +/- prefix
+ content: line.slice(1),     // Remove +/- prefix
```

---

## Deferred (Off-Limits Files)

### CSS — `src/style.css` (a11y agent owns this file)

| Line | Pattern | Notes |
|------|---------|-------|
| 28 | `-webkit-font-smoothing: antialiased` | Still needed: no unprefixed equivalent; fine to keep |
| 29 | `-moz-osx-font-smoothing: grayscale` | Same — Firefox Gecko proprietary; acceptable for font rendering |
| 777–795 | `::-webkit-scrollbar` pseudo-elements | Chrome/Edge-only custom scrollbar styling. No standard equivalent yet (`scrollbar-width`/`scrollbar-color` do not replace visual track/thumb customisation). Keep but add a `scrollbar-width`/`scrollbar-color` block alongside for Firefox parity. |
| 852–865 | `::-webkit-scrollbar` on `.diff-tooltip-body` | Same as above |
| 1192–1205 | `::-webkit-scrollbar` on `.diff-page-hunks` | Same as above |
| 1275–1287 | `::-webkit-scrollbar` on `.diff-page-code` | Same as above |

**No `-ms-` prefixes, no `clip: rect(...)`, no `filter: alpha(...)`, no
`@import` at runtime found in `style.css`. The `-webkit-font-smoothing` and
`-moz-osx-font-smoothing` usages are both still the recommended approach for
font rendering on macOS/retina — do not remove.**

The `::-webkit-scrollbar` blocks are the only genuinely deferred items here.
The a11y agent should add `scrollbar-width: thin; scrollbar-color: <thumb>
<track>;` fallback blocks alongside the webkit rules.

---

### TypeScript — `src/main.ts` (off-limits; a11y/pnpm agents active)

| Line | Pattern |
|------|---------|
| 99 | `diffSummaryOpenBtn` declared but never read — flagged by `tsc` as error TS6133. This is a pre-existing issue introduced before this audit. |

---

### TypeScript — `src/components/diffSettings/index.ts`, `src/components/scoreLoader/index.ts` (off-limits components)

| File | Line | Pattern | Notes |
|------|------|---------|-------|
| `scoreLoader/index.ts` | 313–322 | `.then().catch().finally()` chain | Could be `async/await` but the enclosing callback is already an arrow function and the chain is clear. Flag only — not a safety issue. |

---

### Config — `tsconfig.json` (pnpm migration agent owns this)

| Issue | Current value | Recommended |
|-------|--------------|-------------|
| `lib` includes only `ES2023` | `["ES2023", "DOM", "DOM.Iterable"]` | Fine for a 2025/2026 project targeting modern browsers. No change needed. |
| `target` | `ES2023` | Fine — `ES2022`/`ES2023` is the correct 2026 target. |
| `moduleResolution` | `bundler` | Correct for Vite. No change needed. |
| `types` | pnpm migration agent removed `"bun"` | This causes `bun:test` and `Bun.*` to fail `tsc --noEmit` in test files. The pnpm migration must add `vitest` types or restore `bun` types per whichever runner they target. **Out of scope for this audit.** |

---

### Config — `package.json` (pnpm migration agent owns this)

| Issue | Status |
|-------|--------|
| `"main"` field alongside `"exports"` | Both present and correct. `"exports"` takes precedence in Node 12+. `"main"` is the Node 10 fallback. No action needed. |

---

### Config — `.github/workflows/*.yml` (pnpm migration agent owns these)

All pinned action versions checked. Current state:

| Action | Version used | Current stable |
|--------|-------------|----------------|
| `actions/checkout` | `@v4` | v4 (current) |
| `oven-sh/setup-bun` | `@v2` | v2 (current) |
| `actions/upload-artifact` | `@v4` | v4 (current) |
| `actions/upload-pages-artifact` | `@v3` | v3 (current) |
| `actions/deploy-pages` | `@v4` | v4 (current) |
| `actions/setup-node` | `@v4` | v4 (current) |

**All action versions are at current stable majors. No bumps needed.**

---

### E2E tests — `tests/e2e/` (tester agent owns these)

No deprecated patterns found in `tests/e2e/diff-flow.spec.ts` or
`tests/e2e/library-export.spec.ts`. Flagging for completeness only.

---

## Patterns with Zero Hits

The following patterns from the audit checklist were searched and found
clean across the entire in-scope file tree:

- `event.keyCode` / `event.which` — zero occurrences
- `escape()` / `unescape()` — zero occurrences
- `document.execCommand` — zero occurrences
- `new Date().toGMTString()` — zero occurrences
- `__defineGetter__` / `__defineSetter__` — zero occurrences
- `Function.prototype.caller` / `arguments.callee` — zero occurrences
- `with` statements — zero occurrences
- `var` declarations in TS source — zero occurrences
- `indexOf >= 0` (prefer `.includes`) — zero occurrences
- `parseInt` without radix — zero occurrences (all callsites pass `10`)
- `require()` / `module.exports` in TS source — zero occurrences
- `as any` type assertions — zero occurrences
- `/// <reference path="..." />` — zero occurrences
- `-ms-` CSS prefixes — zero occurrences
- `filter: alpha(...)` — zero occurrences
- `clip: rect(...)` visually-hidden — zero occurrences
- Deprecated HTML elements (`<frame>`, `<center>`, etc.) — zero occurrences
- `<meta http-equiv="X-UA-Compatible">` — zero occurrences
- `-webkit-transform` / `-moz-border-radius` (removable vendor prefixes) — zero occurrences
