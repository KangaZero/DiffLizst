/**
 * Unit tests for the DOM-resolution helpers in applyDiffHighlights.ts.
 *
 * `applyDiffHighlights` itself is a side-effectful renderer that mutates real
 * `<div>` containers, which is out of scope for `bun test`. But the two
 * map-building helpers (`buildMeasureIdMap`, `buildChildIdMap`) are pure
 * — they take a toolkit-like object that returns an MEI string and produce
 * lookup maps. Those are eminently unit-testable.
 *
 * Run with: `bun test src/tests/applyDiffHighlights.test.ts`
 */

import { describe, expect, it } from "vitest";
import { buildChildIdMap, buildMeasureIdMap } from "@/utils/applyDiffHighlights";

/**
 * Minimal toolkit stub. The real {@link buildMeasureIdMap} only calls
 * `getMEI(...)`, so we just need to return a string. This avoids pulling in
 * the verovio WASM toolkit for unit tests.
 */
function fakeToolkit(mei: string): {
  getMEI(opts?: { pageNo?: number; scoreBased?: boolean }): string;
} {
  return { getMEI: () => mei };
}

const TWO_MEASURE_MEI = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei">
  <music>
    <body>
      <mdiv>
        <score>
          <section>
            <measure n="1" xml:id="m-uuid-1">
              <staff n="1">
                <layer n="1">
                  <note xml:id="note-aaa" pname="c" oct="4" dur="4"/>
                  <note xml:id="note-bbb" pname="d" oct="4" dur="4"/>
                  <rest xml:id="rest-ccc" dur="4"/>
                </layer>
              </staff>
            </measure>
            <measure n="2" xml:id="m-uuid-2">
              <staff n="1">
                <layer n="1">
                  <note xml:id="note-ddd" pname="e" oct="4" dur="4"/>
                </layer>
              </staff>
            </measure>
          </section>
        </score>
      </mdiv>
    </body>
  </music>
</mei>`;

describe("buildMeasureIdMap", () => {
  it("maps each measure's xml:id to its MEI 'n' attribute", () => {
    const map = buildMeasureIdMap(fakeToolkit(TWO_MEASURE_MEI));
    expect(map.get("m-uuid-1")).toBe(1);
    expect(map.get("m-uuid-2")).toBe(2);
  });

  it("returns a map with exactly one entry per measure", () => {
    const map = buildMeasureIdMap(fakeToolkit(TWO_MEASURE_MEI));
    expect(map.size).toBe(2);
  });

  it("returns an empty map when the toolkit yields invalid MEI", () => {
    const map = buildMeasureIdMap(fakeToolkit("not-xml"));
    // The function swallows parser errors and returns an empty map by design
    // — callers don't want the app to crash on a transient toolkit hiccup.
    expect(map.size).toBe(0);
  });

  it("falls back to a 1-based document index when 'n' is missing", () => {
    const meiNoN = `<?xml version="1.0"?>
<mei xmlns="http://www.music-encoding.org/ns/mei">
  <music><body><mdiv><score><section>
    <measure xml:id="anon-1"><staff n="1"><layer n="1"/></staff></measure>
    <measure xml:id="anon-2"><staff n="1"><layer n="1"/></staff></measure>
  </section></score></mdiv></body></music>
</mei>`;
    const map = buildMeasureIdMap(fakeToolkit(meiNoN));
    expect(map.get("anon-1")).toBe(1);
    expect(map.get("anon-2")).toBe(2);
  });

  it("skips measures without xml:id", () => {
    const meiPartialIds = `<?xml version="1.0"?>
<mei xmlns="http://www.music-encoding.org/ns/mei">
  <music><body><mdiv><score><section>
    <measure n="1" xml:id="has-id"><staff n="1"><layer n="1"/></staff></measure>
    <measure n="2"><staff n="1"><layer n="1"/></staff></measure>
  </section></score></mdiv></body></music>
</mei>`;
    const map = buildMeasureIdMap(fakeToolkit(meiPartialIds));
    expect(map.size).toBe(1);
    expect(map.get("has-id")).toBe(1);
  });
});

describe("buildChildIdMap", () => {
  it("keys each note's xml:id to '<measure-n>-note-<index>'", () => {
    const map = buildChildIdMap(fakeToolkit(TWO_MEASURE_MEI));
    expect(map.get("note-aaa")).toBe("1-note-0");
    expect(map.get("note-bbb")).toBe("1-note-1");
    expect(map.get("note-ddd")).toBe("2-note-0");
  });

  it("keys rests with the same shape but '-rest-' segment", () => {
    const map = buildChildIdMap(fakeToolkit(TWO_MEASURE_MEI));
    expect(map.get("rest-ccc")).toBe("1-rest-0");
  });

  it("indexes notes and rests on separate counters", () => {
    // In measure 1: note 0, note 1, rest 0 — proves the indexes are per-tag.
    const map = buildChildIdMap(fakeToolkit(TWO_MEASURE_MEI));
    expect(map.get("note-bbb")).toBe("1-note-1"); // not "1-note-2"
    expect(map.get("rest-ccc")).toBe("1-rest-0"); // not "1-rest-2"
  });

  it("returns an empty map when MEI is invalid", () => {
    const map = buildChildIdMap(fakeToolkit("not-xml-at-all"));
    expect(map.size).toBe(0);
  });

  it("ignores measures without an 'n' attribute (no stable measure key)", () => {
    const meiNoN = `<?xml version="1.0"?>
<mei xmlns="http://www.music-encoding.org/ns/mei">
  <music><body><mdiv><score><section>
    <measure xml:id="anon"><staff n="1"><layer n="1">
      <note xml:id="orphan-note" pname="c" oct="4"/>
    </layer></staff></measure>
  </section></score></mdiv></body></music>
</mei>`;
    const map = buildChildIdMap(fakeToolkit(meiNoN));
    expect(map.has("orphan-note")).toBe(false);
  });
});
