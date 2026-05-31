/**
 * One-shot sanity check for the real-world MusicXML fixture set.
 *
 * Walks `tests/fixtures/musicxml-real/`, parses each `.musicxml` / `.xml`
 * file with the same `linkedom` DOMParser the test runtime uses, and
 * reports any file whose root is not `<score-partwise>` or `<score-timewise>`.
 *
 * Exit code is non-zero if any file fails — wire into pre-commit if you
 * want hard enforcement. Used standalone today by the fixture fetcher.
 *
 * Run with: `bun run scripts/validate-fixtures.ts`
 */

import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { DOMParser } from "linkedom";

const FIXTURE_DIR = fileURLToPath(
  new URL("../tests/fixtures/musicxml-real/", import.meta.url),
);

const VALID_ROOTS = new Set(["score-partwise", "score-timewise"]);

const FIXTURE_EXTENSIONS = new Set([".musicxml", ".xml"]);

type Result =
  | { kind: "ok"; file: string; root: string }
  | { kind: "fail"; file: string; reason: string };

async function validateOne(file: string): Promise<Result> {
  const path = `${FIXTURE_DIR}${file}`;
  let xml: string;
  try {
    xml = await Bun.file(path).text();
  } catch (err) {
    return { kind: "fail", file, reason: `read: ${(err as Error).message}` };
  }

  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const root = doc.documentElement?.nodeName;
  if (root === undefined) {
    return { kind: "fail", file, reason: "no documentElement" };
  }
  if (!VALID_ROOTS.has(root)) {
    return { kind: "fail", file, reason: `unexpected root <${root}>` };
  }
  return { kind: "ok", file, root };
}

async function main(): Promise<void> {
  const entries = await readdir(FIXTURE_DIR);
  const fixtures = entries.filter((name) => {
    const dot = name.lastIndexOf(".");
    if (dot < 0) return false;
    return FIXTURE_EXTENSIONS.has(name.slice(dot).toLowerCase());
  });

  if (fixtures.length === 0) {
    console.error("No fixtures found in", FIXTURE_DIR);
    process.exit(1);
  }

  const results = await Promise.all(fixtures.map(validateOne));
  const failures = results.filter((r): r is Extract<Result, { kind: "fail" }> => r.kind === "fail");

  for (const r of results) {
    if (r.kind === "ok") {
      console.log(`ok    ${r.file}  <${r.root}>`);
    } else {
      console.log(`FAIL  ${r.file}  ${r.reason}`);
    }
  }

  console.log(
    `\n${results.length - failures.length}/${results.length} fixtures parsed cleanly`,
  );
  if (failures.length > 0) process.exit(1);
}

await main();
