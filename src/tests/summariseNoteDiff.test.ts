/**
 * Unit tests for `summariseNoteDiff` — the human-readable field walker that
 * powers the diff tooltip's "pitch: C4 -> E4" header.
 *
 * Run with: bun test src/tests/summariseNoteDiff.test.ts
 */

import { describe, expect, it } from "vitest";
import { summariseNoteDiff } from "@/utils/diffXML";

/**
 * Parse a `<note>` XML fragment and return the first `<note>` element.
 * Keeps fixtures readable — tests pass two such elements to the walker.
 */
function parseNote(noteXml: string): Element {
  const wrapped = `<root>${noteXml}</root>`;
  const doc = new DOMParser().parseFromString(wrapped, "application/xml");
  const note = doc.querySelector("note");
  if (!note) throw new Error(`Test fixture has no <note>: ${noteXml}`);
  return note;
}

describe("summariseNoteDiff", () => {
  it("reports a pitch step change as 'C4 -> E4'", () => {
    const a = parseNote(
      "<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>",
    );
    const b = parseNote(
      "<note><pitch><step>E</step><octave>4</octave></pitch><duration>4</duration></note>",
    );
    const summary = summariseNoteDiff(a, b);
    expect(summary).toEqual([{ field: "pitch", before: "C4", after: "E4" }]);
  });

  it("reports an octave change while step is unchanged", () => {
    const a = parseNote("<note><pitch><step>G</step><octave>3</octave></pitch></note>");
    const b = parseNote("<note><pitch><step>G</step><octave>5</octave></pitch></note>");
    expect(summariseNoteDiff(a, b)).toEqual([{ field: "pitch", before: "G3", after: "G5" }]);
  });

  it("renders alter=1 as a sharp and alter=-1 as a flat", () => {
    const a = parseNote(
      "<note><pitch><step>F</step><alter>1</alter><octave>4</octave></pitch></note>",
    );
    const b = parseNote(
      "<note><pitch><step>B</step><alter>-1</alter><octave>3</octave></pitch></note>",
    );
    expect(summariseNoteDiff(a, b)).toEqual([{ field: "pitch", before: "F#4", after: "Bb3" }]);
  });

  it("renders double sharps and double flats", () => {
    const a = parseNote(
      "<note><pitch><step>F</step><alter>2</alter><octave>4</octave></pitch></note>",
    );
    const b = parseNote(
      "<note><pitch><step>B</step><alter>-2</alter><octave>3</octave></pitch></note>",
    );
    expect(summariseNoteDiff(a, b)).toEqual([{ field: "pitch", before: "F##4", after: "Bbb3" }]);
  });

  it("reports a duration change", () => {
    const a = parseNote(
      "<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>",
    );
    const b = parseNote(
      "<note><pitch><step>C</step><octave>4</octave></pitch><duration>8</duration></note>",
    );
    expect(summariseNoteDiff(a, b)).toEqual([{ field: "duration", before: "4", after: "8" }]);
  });

  it("reports a voice change", () => {
    const a = parseNote(
      "<note><pitch><step>C</step><octave>4</octave></pitch><voice>1</voice></note>",
    );
    const b = parseNote(
      "<note><pitch><step>C</step><octave>4</octave></pitch><voice>2</voice></note>",
    );
    expect(summariseNoteDiff(a, b)).toEqual([{ field: "voice", before: "1", after: "2" }]);
  });

  it("reports a type change (quarter -> eighth)", () => {
    const a = parseNote(
      "<note><pitch><step>C</step><octave>4</octave></pitch><type>quarter</type></note>",
    );
    const b = parseNote(
      "<note><pitch><step>C</step><octave>4</octave></pitch><type>eighth</type></note>",
    );
    expect(summariseNoteDiff(a, b)).toEqual([
      { field: "type", before: "quarter", after: "eighth" },
    ]);
  });

  it("reports a stem direction change", () => {
    const a = parseNote(
      "<note><pitch><step>C</step><octave>4</octave></pitch><stem>up</stem></note>",
    );
    const b = parseNote(
      "<note><pitch><step>C</step><octave>4</octave></pitch><stem>down</stem></note>",
    );
    expect(summariseNoteDiff(a, b)).toEqual([{ field: "stem", before: "up", after: "down" }]);
  });

  it("reports a lyric text change", () => {
    const a = parseNote(
      "<note><pitch><step>C</step><octave>4</octave></pitch><lyric><text>la</text></lyric></note>",
    );
    const b = parseNote(
      "<note><pitch><step>C</step><octave>4</octave></pitch><lyric><text>doh</text></lyric></note>",
    );
    expect(summariseNoteDiff(a, b)).toEqual([{ field: "lyric", before: "la", after: "doh" }]);
  });

  it("collects multiple field changes from a single note diff", () => {
    const a = parseNote(`
      <note>
        <pitch><step>C</step><octave>4</octave></pitch>
        <duration>4</duration>
        <voice>1</voice>
        <type>quarter</type>
      </note>
    `);
    const b = parseNote(`
      <note>
        <pitch><step>E</step><octave>4</octave></pitch>
        <duration>8</duration>
        <voice>2</voice>
        <type>eighth</type>
      </note>
    `);
    const summary = summariseNoteDiff(a, b);
    // Order follows NOTE_FIELDS declaration: pitch, duration, voice, type, stem, lyric.
    expect(summary).toEqual([
      { field: "pitch", before: "C4", after: "E4" },
      { field: "duration", before: "4", after: "8" },
      { field: "voice", before: "1", after: "2" },
      { field: "type", before: "quarter", after: "eighth" },
    ]);
  });

  it("returns an empty array when the two notes are semantically identical", () => {
    const a = parseNote(
      "<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>",
    );
    const b = parseNote(
      "<note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration></note>",
    );
    expect(summariseNoteDiff(a, b)).toEqual([]);
  });

  it("treats an added field as '(none) -> value'", () => {
    const a = parseNote("<note><pitch><step>C</step><octave>4</octave></pitch></note>");
    const b = parseNote(
      "<note><pitch><step>C</step><octave>4</octave></pitch><stem>up</stem></note>",
    );
    expect(summariseNoteDiff(a, b)).toEqual([{ field: "stem", before: "(none)", after: "up" }]);
  });

  it("treats a removed field as 'value -> (none)'", () => {
    const a = parseNote(
      "<note><pitch><step>C</step><octave>4</octave></pitch><lyric><text>la</text></lyric></note>",
    );
    const b = parseNote("<note><pitch><step>C</step><octave>4</octave></pitch></note>");
    expect(summariseNoteDiff(a, b)).toEqual([{ field: "lyric", before: "la", after: "(none)" }]);
  });

  it("recognises <rest/> as the 'pitch' field value", () => {
    const a = parseNote("<note><pitch><step>C</step><octave>4</octave></pitch></note>");
    const b = parseNote("<note><rest/><duration>4</duration></note>");
    const summary = summariseNoteDiff(a, b);
    // Pitch changed from C4 to rest; duration added (none -> 4).
    expect(summary).toEqual([
      { field: "pitch", before: "C4", after: "rest" },
      { field: "duration", before: "(none)", after: "4" },
    ]);
  });
});
