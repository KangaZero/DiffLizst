/**
 * Pure computation of score statistics from a MusicXML string.
 *
 * No DOM mutation. Uses DOMParser (browser-native / linkedom in tests).
 * Robust to missing fields — every output field has a sensible default.
 */

export interface ScoreStats {
  measureCount: number;
  noteCount: number;
  restCount: number;
  partCount: number;
  parts: { id: string; name: string; instrument: string }[];
  keySignatures: string[];
  timeSignatures: string[];
  tempoMarkings: string[];
  workTitle?: string;
  composer?: string;
}

// ─── Key signature lookup ──────────────────────────────────────────────────

const MAJOR_KEYS = new Map<number, string>([
  [-7, "C♭ major"],
  [-6, "G♭ major"],
  [-5, "D♭ major"],
  [-4, "A♭ major"],
  [-3, "E♭ major"],
  [-2, "B♭ major"],
  [-1, "F major"],
  [0, "C major"],
  [1, "G major"],
  [2, "D major"],
  [3, "A major"],
  [4, "E major"],
  [5, "B major"],
  [6, "F♯ major"],
  [7, "C♯ major"],
]);

const MINOR_KEYS = new Map<number, string>([
  [-7, "A♭ minor"],
  [-6, "E♭ minor"],
  [-5, "B♭ minor"],
  [-4, "F minor"],
  [-3, "C minor"],
  [-2, "G minor"],
  [-1, "D minor"],
  [0, "A minor"],
  [1, "E minor"],
  [2, "B minor"],
  [3, "F♯ minor"],
  [4, "C♯ minor"],
  [5, "G♯ minor"],
  [6, "D♯ minor"],
  [7, "A♯ minor"],
]);

function decodeKeySignature(fifths: number, mode: string): string {
  const table = mode === "minor" ? MINOR_KEYS : MAJOR_KEYS;
  return table.get(fifths) ?? `${fifths >= 0 ? "+" : ""}${fifths} (unknown)`;
}

// ─── Tempo word matching ───────────────────────────────────────────────────

// Standard tempo terms — single word, no digits.
const TEMPO_TERMS = new Set([
  "Larghissimo",
  "Grave",
  "Largo",
  "Lento",
  "Larghetto",
  "Adagio",
  "Adagietto",
  "Andante",
  "Andantino",
  "Moderato",
  "Andante moderato",
  "Allegretto",
  "Allegro",
  "Vivace",
  "Vivacissimo",
  "Allegrissimo",
  "Presto",
  "Prestissimo",
  "Maestoso",
  "Cantabile",
  "Dolce",
  "Espressivo",
  "Grazioso",
  "Mässig",
  "Mäßig",
  "Leggiero",
  "Agitato",
  "Furioso",
  "Con brio",
  "Con fuoco",
  "Con moto",
  "Con spirito",
  "Sostenuto",
  "Tranquillo",
  "Vivo",
]);

function isTempoTerm(text: string): boolean {
  const trimmed = text.trim();
  // Reject if it contains digits or is multi-line.
  if (/\d/.test(trimmed) || trimmed.includes("\n")) return false;
  const words = trimmed.split(/\s+/);
  // Allow 1–3 word phrases.
  if (words.length === 0 || words.length > 3) return false;
  return TEMPO_TERMS.has(trimmed) || TEMPO_TERMS.has(words[0]);
}

// ─── Text helpers ──────────────────────────────────────────────────────────

function childText(el: Element, tagName: string): string {
  return el.querySelector(tagName)?.textContent?.trim() ?? "";
}

// ─── Main export ───────────────────────────────────────────────────────────

export function computeScoreStats(xml: string): ScoreStats {
  if (!xml.trim()) {
    return {
      measureCount: 0,
      noteCount: 0,
      restCount: 0,
      partCount: 0,
      parts: [],
      keySignatures: [],
      timeSignatures: [],
      tempoMarkings: [],
    };
  }

  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const root = doc.documentElement;

  // Parse errors produce a <parsererror> root in native DOMParser.
  if (!root || root.nodeName === "parsererror") {
    return {
      measureCount: 0,
      noteCount: 0,
      restCount: 0,
      partCount: 0,
      parts: [],
      keySignatures: [],
      timeSignatures: [],
      tempoMarkings: [],
    };
  }

  // ── Work metadata ────────────────────────────────────────────────────────

  const workTitle = root.querySelector("work > work-title")?.textContent?.trim() || undefined;
  const composer =
    Array.from(root.querySelectorAll("identification > creator"))
      .find((el) => el.getAttribute("type") === "composer")
      ?.textContent?.trim() || undefined;

  // ── Parts ────────────────────────────────────────────────────────────────

  const scorePartEls = root.querySelectorAll("part-list > score-part");
  const parts = Array.from(scorePartEls).map((sp) => {
    const id = sp.getAttribute("id") ?? "";
    const name = sp.querySelector("part-name")?.textContent?.trim() ?? "";
    const instrument = sp.querySelector("instrument-name")?.textContent?.trim() ?? name;
    return { id, name, instrument };
  });

  // ── Measures + notes + rests ─────────────────────────────────────────────

  const measureEls = root.querySelectorAll("part > measure");
  const measureCount = measureEls.length;

  let noteCount = 0;
  let restCount = 0;

  for (const measure of measureEls) {
    for (const note of measure.querySelectorAll("note")) {
      if (note.querySelector("rest")) {
        restCount++;
      } else {
        noteCount++;
      }
    }
  }

  // ── Key signatures (distinct, in order of first appearance) ─────────────

  const keySignatures: string[] = [];
  const seenKeys = new Set<string>();

  for (const keyEl of root.querySelectorAll("attributes > key")) {
    const fifthsText = keyEl.querySelector("fifths")?.textContent?.trim() ?? "0";
    const fifths = Number.parseInt(fifthsText, 10);
    const mode = keyEl.querySelector("mode")?.textContent?.trim() ?? "major";
    const label = decodeKeySignature(Number.isNaN(fifths) ? 0 : fifths, mode);
    if (!seenKeys.has(label)) {
      seenKeys.add(label);
      keySignatures.push(label);
    }
  }

  // ── Time signatures (distinct, in order of first appearance) ────────────

  const timeSignatures: string[] = [];
  const seenTimes = new Set<string>();

  for (const timeEl of root.querySelectorAll("attributes > time")) {
    const beats = childText(timeEl, "beats");
    const beatType = childText(timeEl, "beat-type");
    if (!beats || !beatType) continue;
    const label = `${beats}/${beatType}`;
    if (!seenTimes.has(label)) {
      seenTimes.add(label);
      timeSignatures.push(label);
    }
  }

  // ── Tempo markings (distinct, in order of first appearance) ─────────────

  const tempoMarkings: string[] = [];
  const seenTempos = new Set<string>();

  for (const dirEl of root.querySelectorAll("direction")) {
    // Collect BPM values from <sound tempo="...">
    const soundEl = dirEl.querySelector("sound[tempo]");
    if (soundEl) {
      const bpm = soundEl.getAttribute("tempo")?.trim();
      if (bpm && !seenTempos.has(bpm)) {
        seenTempos.add(bpm);
        tempoMarkings.push(bpm);
      }
    }

    // Collect tempo text from <direction-type><words>
    for (const wordsEl of dirEl.querySelectorAll("direction-type > words")) {
      const text = wordsEl.textContent?.trim() ?? "";
      if (text && isTempoTerm(text) && !seenTempos.has(text)) {
        seenTempos.add(text);
        tempoMarkings.push(text);
      }
    }
  }

  return {
    measureCount,
    noteCount,
    restCount,
    partCount: parts.length,
    parts,
    keySignatures,
    timeSignatures,
    tempoMarkings,
    workTitle,
    composer,
  };
}
