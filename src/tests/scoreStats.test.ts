/**
 * Unit tests for computeScoreStats.
 *
 * Run with: pnpm vitest run src/tests/scoreStats.test.ts
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { computeScoreStats } from "@/utils/scoreStats";

const FIXTURE_DIR = fileURLToPath(new URL("../../tests/fixtures/musicxml-real/", import.meta.url));

function readFixture(filename: string): string {
  return readFileSync(`${FIXTURE_DIR}${filename}`, "utf-8");
}

// ─── Minimal XML builders ─────────────────────────────────────────────────

function makeMinimalXML({
  workTitle = "",
  composer = "",
  keyFifths = 0,
  keyMode = "major",
  beats = "4",
  beatType = "4",
  partId = "P1",
  partName = "Piano",
  instrumentName = "Piano",
  notes = `<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>quarter</type></note>`,
  measures = 1,
  extraMeasures = "",
  soundTempo = "",
  wordsText = "",
}: {
  workTitle?: string;
  composer?: string;
  keyFifths?: number;
  keyMode?: string;
  beats?: string;
  beatType?: string;
  partId?: string;
  partName?: string;
  instrumentName?: string;
  notes?: string;
  measures?: number;
  extraMeasures?: string;
  soundTempo?: string;
  wordsText?: string;
} = {}): string {
  const workBlock = workTitle ? `<work><work-title>${workTitle}</work-title></work>` : "";
  const identBlock = composer
    ? `<identification><creator type="composer">${composer}</creator></identification>`
    : "";
  const dirBlock =
    soundTempo || wordsText
      ? `<direction>
          <direction-type>${wordsText ? `<words>${wordsText}</words>` : ""}</direction-type>
          ${soundTempo ? `<sound tempo="${soundTempo}"/>` : ""}
        </direction>`
      : "";
  const measureBlock = Array.from({ length: measures }, (_, i) => {
    const attribs =
      i === 0
        ? `<attributes>
            <key><fifths>${keyFifths}</fifths><mode>${keyMode}</mode></key>
            <time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>
          </attributes>
          ${dirBlock}`
        : "";
    return `<measure number="${i + 1}">${attribs}${notes}</measure>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise>
  ${workBlock}
  ${identBlock}
  <part-list>
    <score-part id="${partId}">
      <part-name>${partName}</part-name>
      <score-instrument id="${partId}I1">
        <instrument-name>${instrumentName}</instrument-name>
      </score-instrument>
    </score-part>
  </part-list>
  <part id="${partId}">
    ${measureBlock}
    ${extraMeasures}
  </part>
</score-partwise>`;
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("computeScoreStats", () => {
  it("returns all zeros / empty arrays for empty XML string", () => {
    const stats = computeScoreStats("");
    expect(stats.measureCount).toBe(0);
    expect(stats.noteCount).toBe(0);
    expect(stats.restCount).toBe(0);
    expect(stats.partCount).toBe(0);
    expect(stats.parts).toEqual([]);
    expect(stats.keySignatures).toEqual([]);
    expect(stats.timeSignatures).toEqual([]);
    expect(stats.tempoMarkings).toEqual([]);
    expect(stats.workTitle).toBeUndefined();
    expect(stats.composer).toBeUndefined();
  });

  it("returns all zeros / empty arrays for whitespace-only string", () => {
    const stats = computeScoreStats("   \n  ");
    expect(stats.measureCount).toBe(0);
    expect(stats.noteCount).toBe(0);
  });

  it("single-measure, single-part, single-note score → exact counts", () => {
    const xml = makeMinimalXML({
      notes: `<note><pitch><step>C</step><octave>4</octave></pitch></note>`,
    });
    const stats = computeScoreStats(xml);
    expect(stats.measureCount).toBe(1);
    expect(stats.noteCount).toBe(1);
    expect(stats.restCount).toBe(0);
    expect(stats.partCount).toBe(1);
    expect(stats.parts).toHaveLength(1);
    expect(stats.parts[0].id).toBe("P1");
    expect(stats.parts[0].name).toBe("Piano");
  });

  it("counts rests separately from notes", () => {
    const xml = makeMinimalXML({
      notes: `<note><pitch><step>C</step><octave>4</octave></pitch></note>
              <note><rest/></note>`,
    });
    const stats = computeScoreStats(xml);
    expect(stats.noteCount).toBe(1);
    expect(stats.restCount).toBe(1);
  });

  it("multiple parts → partCount matches, parts[] reflects each", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise>
  <part-list>
    <score-part id="P1">
      <part-name>Violin</part-name>
      <score-instrument id="P1I1"><instrument-name>Violin</instrument-name></score-instrument>
    </score-part>
    <score-part id="P2">
      <part-name>Cello</part-name>
      <score-instrument id="P2I1"><instrument-name>Cello</instrument-name></score-instrument>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <note><pitch><step>G</step><octave>4</octave></pitch></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <note><pitch><step>C</step><octave>3</octave></pitch></note>
    </measure>
  </part>
</score-partwise>`;
    const stats = computeScoreStats(xml);
    expect(stats.partCount).toBe(2);
    expect(stats.parts).toHaveLength(2);
    expect(stats.parts[0]).toMatchObject({ id: "P1", name: "Violin", instrument: "Violin" });
    expect(stats.parts[1]).toMatchObject({ id: "P2", name: "Cello", instrument: "Cello" });
    // Both measures counted
    expect(stats.measureCount).toBe(2);
  });

  it("multiple key signatures → keySignatures has multiple distinct entries", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <key><fifths>2</fifths><mode>major</mode></key>
      </attributes>
      <note><pitch><step>D</step><octave>4</octave></pitch></note>
    </measure>
    <measure number="2">
      <attributes>
        <key><fifths>-1</fifths><mode>major</mode></key>
      </attributes>
      <note><pitch><step>F</step><octave>4</octave></pitch></note>
    </measure>
    <measure number="3">
      <attributes>
        <key><fifths>2</fifths><mode>major</mode></key>
      </attributes>
      <note><pitch><step>D</step><octave>4</octave></pitch></note>
    </measure>
  </part>
</score-partwise>`;
    const stats = computeScoreStats(xml);
    // D major and F major — third measure is a repeat of D major (distinct only)
    expect(stats.keySignatures).toEqual(["D major", "F major"]);
  });

  it("<fifths>0 + <mode>major</mode> → 'C major'", () => {
    const xml = makeMinimalXML({ keyFifths: 0, keyMode: "major" });
    const stats = computeScoreStats(xml);
    expect(stats.keySignatures).toContain("C major");
  });

  it("<fifths>-3</fifths> with no mode → defaults to 'E♭ major'", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <key><fifths>-3</fifths></key>
      </attributes>
      <note><pitch><step>E</step><octave>4</octave></pitch></note>
    </measure>
  </part>
</score-partwise>`;
    const stats = computeScoreStats(xml);
    expect(stats.keySignatures).toContain("E♭ major");
  });

  it("time signature parsed as beats/beat-type string", () => {
    const xml = makeMinimalXML({ beats: "3", beatType: "4" });
    const stats = computeScoreStats(xml);
    expect(stats.timeSignatures).toContain("3/4");
  });

  it("multiple distinct time signatures are collected in order", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
    </measure>
    <measure number="2">
      <attributes>
        <time><beats>3</beats><beat-type>4</beat-type></time>
      </attributes>
    </measure>
    <measure number="3">
      <attributes>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
    </measure>
  </part>
</score-partwise>`;
    const stats = computeScoreStats(xml);
    expect(stats.timeSignatures).toEqual(["4/4", "3/4"]);
  });

  it("collects BPM tempo from <sound tempo='...'>", () => {
    const xml = makeMinimalXML({ soundTempo: "120" });
    const stats = computeScoreStats(xml);
    expect(stats.tempoMarkings).toContain("120");
  });

  it("collects tempo text from <words> that match known terms", () => {
    const xml = makeMinimalXML({ wordsText: "Allegro" });
    const stats = computeScoreStats(xml);
    expect(stats.tempoMarkings).toContain("Allegro");
  });

  it("ignores <words> with digits", () => {
    const xml = makeMinimalXML({ wordsText: "q = 120" });
    const stats = computeScoreStats(xml);
    expect(stats.tempoMarkings).not.toContain("q = 120");
  });

  it("extracts workTitle from <work-title>", () => {
    const xml = makeMinimalXML({ workTitle: "Etude Op.10 No.1" });
    const stats = computeScoreStats(xml);
    expect(stats.workTitle).toBe("Etude Op.10 No.1");
  });

  it("extracts composer from <creator type='composer'>", () => {
    const xml = makeMinimalXML({ composer: "F. Chopin" });
    const stats = computeScoreStats(xml);
    expect(stats.composer).toBe("F. Chopin");
  });

  it("workTitle and composer are undefined when absent", () => {
    const xml = makeMinimalXML();
    const stats = computeScoreStats(xml);
    expect(stats.workTitle).toBeUndefined();
    expect(stats.composer).toBeUndefined();
  });

  it("measureCount spans measures across all parts", () => {
    const xml = makeMinimalXML({ measures: 4 });
    const stats = computeScoreStats(xml);
    expect(stats.measureCount).toBe(4);
  });

  // ── Real fixture smoke tests ─────────────────────────────────────────────

  it("Bach Air fixture: parses without throwing, non-zero counts", () => {
    const xml = readFixture("osmd_bach_air.xml");
    const stats = computeScoreStats(xml);
    expect(stats.measureCount).toBeGreaterThan(0);
    expect(stats.noteCount).toBeGreaterThan(0);
    expect(stats.partCount).toBeGreaterThan(0);
    expect(stats.keySignatures.length).toBeGreaterThan(0);
    expect(stats.workTitle).toBe("Air");
    expect(stats.composer).toBe("Johann Sebastian Bach");
  });

  it("Bach Air fixture: key signature is 'D major' (fifths=2)", () => {
    const xml = readFixture("osmd_bach_air.xml");
    const stats = computeScoreStats(xml);
    expect(stats.keySignatures).toContain("D major");
  });

  it("Bach Air fixture: time signature is '4/4'", () => {
    const xml = readFixture("osmd_bach_air.xml");
    const stats = computeScoreStats(xml);
    expect(stats.timeSignatures).toContain("4/4");
  });

  it("Schubert An die Musik fixture: parses without throwing", () => {
    const xml = readFixture("osmd_schubert_an_die_musik.xml");
    const stats = computeScoreStats(xml);
    expect(stats.measureCount).toBeGreaterThan(0);
    expect(stats.noteCount).toBeGreaterThan(0);
  });

  it("Hello World fixture: parses without throwing", () => {
    const xml = readFixture("osmd_helloworld.xml");
    expect(() => computeScoreStats(xml)).not.toThrow();
    const stats = computeScoreStats(xml);
    expect(stats.measureCount).toBeGreaterThan(0);
  });
});
