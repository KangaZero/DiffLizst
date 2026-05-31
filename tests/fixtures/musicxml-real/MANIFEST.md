# MusicXML real-world fixtures

Curated set of permissively-licensed MusicXML files used by the smoke
suite (`src/tests/fixtures-smoke.test.ts`).  Every file here is
parseable XML with a `<score-partwise>` or `<score-timewise>` root.

| File | Source | License | Features |
| ---- | ------ | ------- | -------- |
| `osmd_helloworld.xml` | <https://raw.githubusercontent.com/opensheetmusicdisplay/opensheetmusicdisplay/develop/test/data/HelloWorld.xml> | BSD-3-Clause (OSMD repo) / Public Domain (composition) | minimal single-measure score; sanity-check baseline |
| `osmd_saltarello.xml` | <https://raw.githubusercontent.com/opensheetmusicdisplay/opensheetmusicdisplay/develop/test/data/Saltarello.xml> | BSD-3-Clause (OSMD repo) / Public Domain (anonymous 16th-c.) | anonymous Renaissance dance; multi-voice short piece |
| `osmd_bach_air.xml` | <https://raw.githubusercontent.com/opensheetmusicdisplay/opensheetmusicdisplay/develop/test/data/JohannSebastianBach_Air.xml> | BSD-3-Clause (OSMD repo) / Public Domain (Bach d. 1750) | Bach Air on the G String; multi-part string ensemble |
| `osmd_bach_praeludium_bwv846.xml` | <https://raw.githubusercontent.com/opensheetmusicdisplay/opensheetmusicdisplay/develop/test/data/JohannSebastianBach_PraeludiumInCDur_BWV846_1.xml> | BSD-3-Clause (OSMD repo) / Public Domain (Bach d. 1750) | Bach WTC Prelude in C; continuous 16th-note arpeggios |
| `osmd_clementi_sonatina_op36_no1_part1.xml` | <https://raw.githubusercontent.com/opensheetmusicdisplay/opensheetmusicdisplay/develop/test/data/MuzioClementi_SonatinaOpus36No1_Part1.xml> | BSD-3-Clause (OSMD repo) / Public Domain (Clementi d. 1832) | Classical sonata form; piano two-staff with dynamics, slurs |
| `osmd_mozart_an_chloe.xml` | <https://raw.githubusercontent.com/opensheetmusicdisplay/opensheetmusicdisplay/develop/test/data/Mozart_AnChloe.xml> | BSD-3-Clause (OSMD repo) / Public Domain (Mozart d. 1791) | Mozart lieder; voice + piano with lyrics and breath marks |
| `osmd_mozart_das_veilchen.xml` | <https://raw.githubusercontent.com/opensheetmusicdisplay/opensheetmusicdisplay/develop/test/data/Mozart_DasVeilchen.xml> | BSD-3-Clause (OSMD repo) / Public Domain (Mozart d. 1791) | Mozart lieder; complex multi-stanza lyrics |
| `osmd_schubert_an_die_musik.xml` | <https://raw.githubusercontent.com/opensheetmusicdisplay/opensheetmusicdisplay/develop/test/data/Schubert_An_die_Musik.xml> | BSD-3-Clause (OSMD repo) / Public Domain (Schubert d. 1828) | Schubert lied; voice + piano; tempo markings |
| `osmd_schumann_dichterliebe_01.xml` | <https://raw.githubusercontent.com/opensheetmusicdisplay/opensheetmusicdisplay/develop/test/data/Dichterliebe01.xml> | BSD-3-Clause (OSMD repo) / Public Domain (Schumann d. 1856) | Schumann Op. 48 No. 1; voice + piano with phrase marks |
| `osmd_gounod_meditation.xml` | <https://raw.githubusercontent.com/opensheetmusicdisplay/opensheetmusicdisplay/develop/test/data/CharlesGounod_Meditation.xml> | BSD-3-Clause (OSMD repo) / Public Domain (Gounod d. 1893) | Gounod Meditation; flowing slurred lines, tied notes |
| `osmd_debussy_mandoline.xml` | <https://raw.githubusercontent.com/opensheetmusicdisplay/opensheetmusicdisplay/develop/test/data/Debussy_Mandoline.xml> | BSD-3-Clause (OSMD repo) / Public Domain (Debussy d. 1918) | Debussy mélodie; rich harmony, French text |
| `osmd_joplin_entertainer.xml` | <https://raw.githubusercontent.com/opensheetmusicdisplay/opensheetmusicdisplay/develop/test/data/ScottJoplin_The_Entertainer.xml> | BSD-3-Clause (OSMD repo) / Public Domain (Joplin d. 1917) | Joplin ragtime; syncopation, repeats, voltas |
| `osmd_test_grace_notes.xml` | <https://raw.githubusercontent.com/opensheetmusicdisplay/opensheetmusicdisplay/develop/test/data/OSMD_function_test_GraceNotes.xml> | BSD-3-Clause (OSMD repo) | <grace> notes in various contexts |
| `osmd_test_ornaments.xml` | <https://raw.githubusercontent.com/opensheetmusicdisplay/opensheetmusicdisplay/develop/test/data/OSMD_function_test_Ornaments.xml> | BSD-3-Clause (OSMD repo) | trills, turns, mordents, schleifer ornaments |
| `osmd_test_chord_symbols.musicxml` | <https://raw.githubusercontent.com/opensheetmusicdisplay/opensheetmusicdisplay/develop/test/data/OSMD_function_test_chord_symbols.musicxml> | BSD-3-Clause (OSMD repo) | <harmony>/<root>/<kind> chord-symbol nodes above staff |
| `osmd_test_drumset.musicxml` | <https://raw.githubusercontent.com/opensheetmusicdisplay/opensheetmusicdisplay/develop/test/data/OSMD_function_test_drumset.musicxml> | BSD-3-Clause (OSMD repo) | unpitched percussion with <instrument> + <unpitched> |
| `osmd_test_tablature_bends.musicxml` | <https://raw.githubusercontent.com/opensheetmusicdisplay/opensheetmusicdisplay/develop/test/data/OSMD_Function_Test_Tablature_Bends.musicxml> | BSD-3-Clause (OSMD repo) | guitar tab with <technical><bend> notations |
| `osmd_test_repeat.musicxml` | <https://raw.githubusercontent.com/opensheetmusicdisplay/opensheetmusicdisplay/develop/test/data/OSMD_function_Test_Repeat.musicxml> | BSD-3-Clause (OSMD repo) | <barline> repeats, <ending> voltas, segno/coda |
| `osmd_test_multiple_rest_measures.musicxml` | <https://raw.githubusercontent.com/opensheetmusicdisplay/opensheetmusicdisplay/develop/test/data/OSMD_function_test_multiple_rest_measures.musicxml> | BSD-3-Clause (OSMD repo) | <measure-style><multiple-rest> collapsed rest blocks |
| `osmd_test_invisible_notes.musicxml` | <https://raw.githubusercontent.com/opensheetmusicdisplay/opensheetmusicdisplay/develop/test/data/OSMD_function_test_invisible_notes.musicxml> | BSD-3-Clause (OSMD repo) | notes with print-object="no"; layout-only ghost rests |
| `osmd_test_notehead_shapes.musicxml` | <https://raw.githubusercontent.com/opensheetmusicdisplay/opensheetmusicdisplay/develop/test/data/OSMD_function_test_noteheadShapes.musicxml> | BSD-3-Clause (OSMD repo) | <notehead> diamond/x/cross/slash variants |
| `osmd_test_bar_lines.musicxml` | <https://raw.githubusercontent.com/opensheetmusicdisplay/opensheetmusicdisplay/develop/test/data/OSMD_function_test_bar_lines.musicxml> | BSD-3-Clause (OSMD repo) | every <bar-style> (heavy, light-light, dashed, tick, etc.) |
| `osmd_test_accidentals.musicxml` | <https://raw.githubusercontent.com/opensheetmusicdisplay/opensheetmusicdisplay/develop/test/data/OSMD_function_test_accidentals.musicxml> | BSD-3-Clause (OSMD repo) | double-sharp/flat, naturals, parenthesised accidentals |
| `osmd_test_tremolo_2bars.musicxml` | <https://raw.githubusercontent.com/opensheetmusicdisplay/opensheetmusicdisplay/develop/test/data/OSMD_Function_Test_Tremolo_2bars.musicxml> | BSD-3-Clause (OSMD repo) | single- and multi-note <tremolo> across barlines |
| `osmd_test_voice_alignment.musicxml` | <https://raw.githubusercontent.com/opensheetmusicdisplay/opensheetmusicdisplay/develop/test/data/OSMD_Function_Test_Voice_Alignment.musicxml> | BSD-3-Clause (OSMD repo) | <voice> 1..4 in one staff with <backup>/<forward> |

## How to use these fixtures

Test authors should prefer these real-world files over hand-rolled XML
strings whenever a behaviour depends on the messiness of real MusicXML
(comments, redundant whitespace, unusual elements, multiple parts).  Read
them with `Bun.file()` and pass the resulting string straight into
`diffXML`.

```ts
import { diffXML } from "@/utils/diffXML";

const path = new URL(
  "../../tests/fixtures/musicxml-real/osmd_bach_air.xml",
  import.meta.url,
).pathname;
const xml = await Bun.file(path).text();
const result = diffXML(xml, xml, defaultOptions); // self-diff
```

## Regenerating

Run `bun run scripts/fetch-fixtures.ts`.  The script is idempotent —
already-present files are revalidated without a network round-trip.

## License notes

The OpenSheetMusicDisplay test corpus is BSD-3-Clause licensed in its
parent repository (`opensheetmusicdisplay/opensheetmusicdisplay`).
All real-composition files reference composers who died before 1955, so
the underlying compositions are out of copyright in jurisdictions
following the Berne Convention's life+70 baseline.
