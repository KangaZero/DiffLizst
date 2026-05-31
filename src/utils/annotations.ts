/**
 * Annotation data layer — load/save/delete per-measure notes keyed to a diff.
 *
 * All data lives in localStorage under `difflizst.annotations`. The value is a
 * JSON array of all Annotation objects across every diffKey. This keeps the
 * storage schema flat and makes load/save trivial without a secondary index.
 *
 * Size cap: if the serialised array would exceed 1 MB, the oldest entries
 * (lowest `createdAt`) are pruned until it fits.
 */

const STORAGE_KEY = "difflizst.annotations";
const MAX_BYTES = 1_048_576; // 1 MB

export interface Annotation {
  id: string;
  diffKey: string;
  measure: number;
  side?: "left" | "right" | "both";
  text: string;
  createdAt: number;
  updatedAt: number;
}

export function diffKeyFor(leftId: string, rightId: string): string {
  return `${leftId}|${rightId}`;
}

function readAll(): Annotation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Annotation[]) : [];
  } catch {
    return [];
  }
}

function writeAll(annotations: Annotation[]): void {
  let json = JSON.stringify(annotations);
  if (json.length > MAX_BYTES) {
    const sorted = [...annotations].sort((a, b) => a.createdAt - b.createdAt);
    while (sorted.length > 0 && JSON.stringify(sorted).length > MAX_BYTES) {
      sorted.shift();
    }
    json = JSON.stringify(sorted);
  }
  localStorage.setItem(STORAGE_KEY, json);
}

export function loadAnnotations(diffKey: string): Annotation[] {
  return readAll().filter((a) => a.diffKey === diffKey);
}

export function saveAnnotation(a: Annotation): void {
  const all = readAll();
  const idx = all.findIndex((existing) => existing.id === a.id);
  if (idx === -1) {
    all.push(a);
  } else {
    all[idx] = a;
  }
  writeAll(all);
}

export function deleteAnnotation(id: string): void {
  writeAll(readAll().filter((a) => a.id !== id));
}
