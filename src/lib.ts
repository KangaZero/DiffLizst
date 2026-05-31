/**
 * Public library entry point.
 *
 * Consumers of `@kangazero/difflizst-core` import the diff engine from here.
 * The browser web app boots from `src/main.ts` instead — these two builds
 * are produced by `bun run build` (app) and `bun run build:lib` (library).
 *
 * Anything re-exported here is part of the public, semver-stable API.
 * Adding new exports is a minor bump; renaming or removing is a major bump.
 */

export type {
  ChangeType,
  ChildDiffKey,
  DiffLine,
  DiffLineType,
  ElementDiff,
  XMLDiffOptions,
  XMLDiffResult,
} from "@/utils/diffXML";
export { diffXML } from "@/utils/diffXML";
