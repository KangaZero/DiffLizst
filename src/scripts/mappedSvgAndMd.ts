export const MXML_TAG_NAMES = [
  "accent",
  "accidental",
  "alter",
  "articulations",
  "attributes",
  "backup",
  "bar-style",
  "barline",
  "beam",
  "beat-type",
  "beat-unit",
  "beats",
  "bottom-margin",
  "chord",
  "clef",
  "credit",
  "credit-words",
  "defaults",
  "direction",
  "direction-type",
  "display-octave",
  "display-step",
  "divisions",
  "dot",
  "duration",
  "dynamics",
  "encoding",
  "encoding-date",
  "f",
  "fermata",
  "fff",
  "fifths",
  "identification",
  "instrument-name",
  "key",
  "left-margin",
  "line",
  "lyric-font",
  "measure",
  "metronome",
  "midi-channel",
  "midi-device",
  "midi-instrument",
  "midi-program",
  "millimeters",
  "notations",
  "note",
  "octave",
  "octave-shift",
  "other-dynamics",
  "page-height",
  "page-layout",
  "page-margins",
  "page-width",
  "pan",
  "part",
  "part-list",
  "part-name",
  "pedal",
  "per-minute",
  "pitch",
  "print",
  "rest",
  "right-margin",
  "scaling",
  "score-instrument",
  "score-part",
  "score-partwise",
  "sign",
  "software",
  "sound",
  "source",
  "staff",
  "staff-distance",
  "staff-layout",
  "staves",
  "stem",
  "step",
  "supports",
  "system-distance",
  "system-layout",
  "system-margins",
  "tenths",
  "tie",
  "tied",
  "time",
  "top-margin",
  "top-system-distance",
  "type",
  "voice",
  "volume",
  "wedge",
  "word-font",
  "words",
] as const;

type TSpanLeaf = {
  fontSize: string;
  text: string;
};

type TSpanText = {
  id: string;
  class: "text";
  content: TSpanLeaf;
};

type TSpanRend = {
  id: string;
  class: "rend";
  x: number;
  y: number;
  textAnchor: "middle" | "start" | "end";
  content: TSpanText;
};

type PgHeadTextEntry = {
  fontSize: string;
  rend: TSpanRend;
};

export type PgHead = {
  id: string;
  class: "pgHead";
  entries: PgHeadTextEntry[];
};

type CreditWords = {
  text: string;
  defaultX?: number;
  defaultY?: number;
  justify?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom" | "baseline";
  fontFamily?: string;
  fontSize?: number;
};

export type Credit = {
  page: number;
  words: CreditWords[];
};

export type MXMLTagName = (typeof MXML_TAG_NAMES)[number];
