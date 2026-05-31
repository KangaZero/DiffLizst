/**
 * One-shot fetcher for real-world MusicXML fixtures.
 *
 * Downloads a curated set of permissively-licensed MusicXML files into
 * `tests/fixtures/musicxml-real/` for the smoke suite to exercise.
 *
 * Run with: `bun run scripts/fetch-fixtures.ts`
 *
 * Notes:
 *   - Uses Node-native `fetch` (Bun ships it) — no `node-fetch`/`axios`.
 *   - Parses every download with `linkedom` (already a dev dep) and rejects
 *     anything whose root element is not <score-partwise> or <score-timewise>.
 *   - Honours a hard ~3 MB total budget; later files are pruned if exceeded.
 */

import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DOMParser } from "linkedom";

const FIXTURE_DIR = fileURLToPath(
  new URL("../tests/fixtures/musicxml-real/", import.meta.url),
);

const OSMD_RAW =
  "https://raw.githubusercontent.com/opensheetmusicdisplay/opensheetmusicdisplay/develop/test/data";

type Fixture = {
  /** Local filename. Prefixed with source slug so collisions are impossible. */
  saveAs: string;
  /** Full upstream URL — used for both fetch and MANIFEST attribution. */
  url: string;
  /** SPDX-ish license tag for the MANIFEST. */
  license: string;
  /** Short, human-readable feature summary for the MANIFEST. */
  features: string;
};

/**
 * OpenSheetMusicDisplay test corpus.
 *   - Repo licensed BSD-3-Clause (LICENSE in repo root).
 *   - Underlying compositions are public domain by composer death date
 *     (all composers selected died well over 70 years ago).
 *   - `OSMD_*` synthetic test files are original to the OSMD project and
 *     thus inherit the repo's BSD-3-Clause grant.
 */
const FIXTURES: Fixture[] = [
  // ── Real compositions (composer PD; encoding BSD-3 via OSMD) ─────────────
  {
    saveAs: "osmd_helloworld.xml",
    url: `${OSMD_RAW}/HelloWorld.xml`,
    license: "BSD-3-Clause (OSMD repo) / Public Domain (composition)",
    features: "minimal single-measure score; sanity-check baseline",
  },
  {
    saveAs: "osmd_saltarello.xml",
    url: `${OSMD_RAW}/Saltarello.xml`,
    license: "BSD-3-Clause (OSMD repo) / Public Domain (anonymous 16th-c.)",
    features: "anonymous Renaissance dance; multi-voice short piece",
  },
  {
    saveAs: "osmd_bach_air.xml",
    url: `${OSMD_RAW}/JohannSebastianBach_Air.xml`,
    license: "BSD-3-Clause (OSMD repo) / Public Domain (Bach d. 1750)",
    features: "Bach Air on the G String; multi-part string ensemble",
  },
  {
    saveAs: "osmd_bach_praeludium_bwv846.xml",
    url: `${OSMD_RAW}/JohannSebastianBach_PraeludiumInCDur_BWV846_1.xml`,
    license: "BSD-3-Clause (OSMD repo) / Public Domain (Bach d. 1750)",
    features: "Bach WTC Prelude in C; continuous 16th-note arpeggios",
  },
  {
    saveAs: "osmd_clementi_sonatina_op36_no1_part1.xml",
    url: `${OSMD_RAW}/MuzioClementi_SonatinaOpus36No1_Part1.xml`,
    license: "BSD-3-Clause (OSMD repo) / Public Domain (Clementi d. 1832)",
    features: "Classical sonata form; piano two-staff with dynamics, slurs",
  },
  {
    saveAs: "osmd_mozart_an_chloe.xml",
    url: `${OSMD_RAW}/Mozart_AnChloe.xml`,
    license: "BSD-3-Clause (OSMD repo) / Public Domain (Mozart d. 1791)",
    features: "Mozart lieder; voice + piano with lyrics and breath marks",
  },
  {
    saveAs: "osmd_mozart_das_veilchen.xml",
    url: `${OSMD_RAW}/Mozart_DasVeilchen.xml`,
    license: "BSD-3-Clause (OSMD repo) / Public Domain (Mozart d. 1791)",
    features: "Mozart lieder; complex multi-stanza lyrics",
  },
  {
    saveAs: "osmd_schubert_an_die_musik.xml",
    url: `${OSMD_RAW}/Schubert_An_die_Musik.xml`,
    license: "BSD-3-Clause (OSMD repo) / Public Domain (Schubert d. 1828)",
    features: "Schubert lied; voice + piano; tempo markings",
  },
  {
    saveAs: "osmd_schumann_dichterliebe_01.xml",
    url: `${OSMD_RAW}/Dichterliebe01.xml`,
    license: "BSD-3-Clause (OSMD repo) / Public Domain (Schumann d. 1856)",
    features: "Schumann Op. 48 No. 1; voice + piano with phrase marks",
  },
  {
    saveAs: "osmd_gounod_meditation.xml",
    url: `${OSMD_RAW}/CharlesGounod_Meditation.xml`,
    license: "BSD-3-Clause (OSMD repo) / Public Domain (Gounod d. 1893)",
    features: "Gounod Meditation; flowing slurred lines, tied notes",
  },
  {
    saveAs: "osmd_debussy_mandoline.xml",
    url: `${OSMD_RAW}/Debussy_Mandoline.xml`,
    license: "BSD-3-Clause (OSMD repo) / Public Domain (Debussy d. 1918)",
    features: "Debussy mélodie; rich harmony, French text",
  },
  {
    saveAs: "osmd_joplin_entertainer.xml",
    url: `${OSMD_RAW}/ScottJoplin_The_Entertainer.xml`,
    license: "BSD-3-Clause (OSMD repo) / Public Domain (Joplin d. 1917)",
    features: "Joplin ragtime; syncopation, repeats, voltas",
  },
  {
    saveAs: "osmd_joplin_elite_syncopations.xml",
    url: `${OSMD_RAW}/ScottJoplin_EliteSyncopations.xml`,
    license: "BSD-3-Clause (OSMD repo) / Public Domain (Joplin d. 1917)",
    features: "Joplin ragtime; multi-section repeats",
  },

  // ── Synthetic feature tests (BSD-3 OSMD originals) ───────────────────────
  {
    saveAs: "osmd_test_grace_notes.xml",
    url: `${OSMD_RAW}/OSMD_function_test_GraceNotes.xml`,
    license: "BSD-3-Clause (OSMD repo)",
    features: "<grace> notes in various contexts",
  },
  {
    saveAs: "osmd_test_ornaments.xml",
    url: `${OSMD_RAW}/OSMD_function_test_Ornaments.xml`,
    license: "BSD-3-Clause (OSMD repo)",
    features: "trills, turns, mordents, schleifer ornaments",
  },
  {
    saveAs: "osmd_test_chord_symbols.musicxml",
    url: `${OSMD_RAW}/OSMD_function_test_chord_symbols.musicxml`,
    license: "BSD-3-Clause (OSMD repo)",
    features: "<harmony>/<root>/<kind> chord-symbol nodes above staff",
  },
  {
    saveAs: "osmd_test_drumset.musicxml",
    url: `${OSMD_RAW}/OSMD_function_test_drumset.musicxml`,
    license: "BSD-3-Clause (OSMD repo)",
    features: "unpitched percussion with <instrument> + <unpitched>",
  },
  {
    saveAs: "osmd_test_tablature_bends.musicxml",
    url: `${OSMD_RAW}/OSMD_Function_Test_Tablature_Bends.musicxml`,
    license: "BSD-3-Clause (OSMD repo)",
    features: "guitar tab with <technical><bend> notations",
  },
  {
    saveAs: "osmd_test_repeat.musicxml",
    url: `${OSMD_RAW}/OSMD_function_Test_Repeat.musicxml`,
    license: "BSD-3-Clause (OSMD repo)",
    features: "<barline> repeats, <ending> voltas, segno/coda",
  },
  {
    saveAs: "osmd_test_multiple_rest_measures.musicxml",
    url: `${OSMD_RAW}/OSMD_function_test_multiple_rest_measures.musicxml`,
    license: "BSD-3-Clause (OSMD repo)",
    features: "<measure-style><multiple-rest> collapsed rest blocks",
  },
  {
    saveAs: "osmd_test_invisible_notes.musicxml",
    url: `${OSMD_RAW}/OSMD_function_test_invisible_notes.musicxml`,
    license: "BSD-3-Clause (OSMD repo)",
    features: "notes with print-object=\"no\"; layout-only ghost rests",
  },
  {
    saveAs: "osmd_test_notehead_shapes.musicxml",
    url: `${OSMD_RAW}/OSMD_function_test_noteheadShapes.musicxml`,
    license: "BSD-3-Clause (OSMD repo)",
    features: "<notehead> diamond/x/cross/slash variants",
  },
  {
    saveAs: "osmd_test_bar_lines.musicxml",
    url: `${OSMD_RAW}/OSMD_function_test_bar_lines.musicxml`,
    license: "BSD-3-Clause (OSMD repo)",
    features: "every <bar-style> (heavy, light-light, dashed, tick, etc.)",
  },
  {
    saveAs: "osmd_test_accidentals.musicxml",
    url: `${OSMD_RAW}/OSMD_function_test_accidentals.musicxml`,
    license: "BSD-3-Clause (OSMD repo)",
    features: "double-sharp/flat, naturals, parenthesised accidentals",
  },
  {
    saveAs: "osmd_test_tremolo_2bars.musicxml",
    url: `${OSMD_RAW}/OSMD_Function_Test_Tremolo_2bars.musicxml`,
    license: "BSD-3-Clause (OSMD repo)",
    features: "single- and multi-note <tremolo> across barlines",
  },
  {
    saveAs: "osmd_test_voice_alignment.musicxml",
    url: `${OSMD_RAW}/OSMD_Function_Test_Voice_Alignment.musicxml`,
    license: "BSD-3-Clause (OSMD repo)",
    features: "<voice> 1..4 in one staff with <backup>/<forward>",
  },
];

// ── Constants ──────────────────────────────────────────────────────────────

/** Hard cap. Beyond this we stop saving further fixtures. */
const MAX_TOTAL_BYTES = 3 * 1024 * 1024;

/** MusicXML root elements we accept. */
const VALID_ROOTS = new Set(["score-partwise", "score-timewise"]);

// ── Helpers ────────────────────────────────────────────────────────────────

function rootElementName(xml: string): string | null {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  // linkedom mirrors browser DOM: documentElement is the root <element>.
  return doc.documentElement?.nodeName ?? null;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

type Result = {
  saveAs: string;
  url: string;
  license: string;
  features: string;
  bytes: number;
  root: string;
};

async function main(): Promise<void> {
  await mkdir(FIXTURE_DIR, { recursive: true });

  let totalBytes = 0;
  const succeeded: Result[] = [];
  const skipped: { saveAs: string; reason: string }[] = [];

  for (const fixture of FIXTURES) {
    const target = join(FIXTURE_DIR, fixture.saveAs);

    if (await pathExists(target)) {
      const existing = await stat(target);
      totalBytes += existing.size;
      // Re-validate already-cached file rather than re-fetching.
      const xml = await Bun.file(target).text();
      const root = rootElementName(xml);
      if (root && VALID_ROOTS.has(root)) {
        succeeded.push({
          ...fixture,
          bytes: existing.size,
          root,
        });
        console.log(`cached ${fixture.saveAs} (${existing.size}B, <${root}>)`);
        continue;
      }
      // Cached file is broken — fall through and re-fetch.
    }

    let res: Response;
    try {
      res = await fetch(fixture.url);
    } catch (err) {
      skipped.push({
        saveAs: fixture.saveAs,
        reason: `network: ${(err as Error).message}`,
      });
      continue;
    }

    if (!res.ok) {
      skipped.push({
        saveAs: fixture.saveAs,
        reason: `HTTP ${res.status} ${res.statusText}`,
      });
      continue;
    }

    const xml = await res.text();
    const root = rootElementName(xml);
    if (root === null || !VALID_ROOTS.has(root)) {
      skipped.push({
        saveAs: fixture.saveAs,
        reason: `invalid MusicXML root: <${root ?? "null"}>`,
      });
      continue;
    }

    const byteLength = Buffer.byteLength(xml, "utf8");
    if (totalBytes + byteLength > MAX_TOTAL_BYTES) {
      skipped.push({
        saveAs: fixture.saveAs,
        reason: `would exceed ${MAX_TOTAL_BYTES}B budget (current ${totalBytes}B + ${byteLength}B)`,
      });
      continue;
    }

    await writeFile(target, xml, "utf8");
    totalBytes += byteLength;
    succeeded.push({ ...fixture, bytes: byteLength, root });
    console.log(`saved  ${fixture.saveAs} (${byteLength}B, <${root}>)`);
  }

  // ── Emit MANIFEST.md ─────────────────────────────────────────────────────

  const manifestPath = join(FIXTURE_DIR, "MANIFEST.md");
  const rows = succeeded
    .map(
      (r) =>
        `| \`${r.saveAs}\` | <${r.url}> | ${r.license} | ${r.features} |`,
    )
    .join("\n");

  const manifest = `# MusicXML real-world fixtures

Curated set of permissively-licensed MusicXML files used by the smoke
suite (\`src/tests/fixtures-smoke.test.ts\`).  Every file here is
parseable XML with a \`<score-partwise>\` or \`<score-timewise>\` root.

| File | Source | License | Features |
| ---- | ------ | ------- | -------- |
${rows}

## How to use these fixtures

Test authors should prefer these real-world files over hand-rolled XML
strings whenever a behaviour depends on the messiness of real MusicXML
(comments, redundant whitespace, unusual elements, multiple parts).  Read
them with \`Bun.file()\` and pass the resulting string straight into
\`diffXML\`.

\`\`\`ts
import { diffXML } from "@/utils/diffXML";

const path = new URL(
  "../../tests/fixtures/musicxml-real/osmd_bach_air.xml",
  import.meta.url,
).pathname;
const xml = await Bun.file(path).text();
const result = diffXML(xml, xml, defaultOptions); // self-diff
\`\`\`

## Regenerating

Run \`bun run scripts/fetch-fixtures.ts\`.  The script is idempotent —
already-present files are revalidated without a network round-trip.

## License notes

The OpenSheetMusicDisplay test corpus is BSD-3-Clause licensed in its
parent repository (\`opensheetmusicdisplay/opensheetmusicdisplay\`).
All real-composition files reference composers who died before 1955, so
the underlying compositions are out of copyright in jurisdictions
following the Berne Convention's life+70 baseline.
`;

  await writeFile(manifestPath, manifest, "utf8");

  console.log(
    `\nSaved ${succeeded.length}/${FIXTURES.length} fixtures (${totalBytes} bytes total)`,
  );
  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length}:`);
    for (const s of skipped) console.log(`  - ${s.saveAs}: ${s.reason}`);
  }
}

await main();
