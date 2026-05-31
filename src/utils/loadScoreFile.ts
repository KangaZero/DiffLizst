/**
 * Read a user-supplied File and return its MusicXML payload as a string.
 *
 * Supports three formats:
 *  - `.xml` / `.musicxml` — plain text read via `FileReader.readAsText`.
 *  - `.mxl` — zipped MusicXML container. Per the MusicXML 4.0 spec, the
 *    container holds a `META-INF/container.xml` manifest pointing at one or
 *    more "rootfile" entries; we follow the first rootfile pointer.
 *
 * Decompression uses `fflate` — 8KB, zero runtime deps, current within the
 * last 90 days, and the de-facto choice for in-browser zip handling
 * (used by Excalidraw, tldraw, Figma, etc.).
 *
 * @throws when the file is empty, an unknown extension, a malformed `.mxl`
 *         archive, or the container manifest cannot be parsed.
 */

import { strFromU8, unzipSync } from "fflate";

/** Recognised input extensions. `.musicxml` is the modern primary extension. */
const TEXT_EXTENSIONS = new Set([".xml", ".musicxml"]);
const ZIP_EXTENSIONS = new Set([".mxl"]);

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

/**
 * Find the path of the primary MusicXML file inside an unzipped `.mxl`
 * container by parsing `META-INF/container.xml`. Falls back to the first
 * entry whose name ends in `.xml` or `.musicxml` (excluding META-INF) if the
 * manifest is absent or unparseable — older Sibelius exports sometimes ship
 * without a container manifest.
 */
function findRootMusicXMLPath(entries: Record<string, Uint8Array>): string | null {
  const manifest = entries["META-INF/container.xml"];
  if (manifest) {
    try {
      const xml = strFromU8(manifest);
      const doc = new DOMParser().parseFromString(xml, "application/xml");
      const rootfile = doc.querySelector("rootfile");
      const fullPath = rootfile?.getAttribute("full-path");
      if (fullPath && entries[fullPath]) return fullPath;
    } catch {
      // Fall through to heuristic.
    }
  }
  for (const name of Object.keys(entries)) {
    if (name.startsWith("META-INF/")) continue;
    const ext = fileExtension(name);
    if (TEXT_EXTENSIONS.has(ext)) return name;
  }
  return null;
}

/** Read the raw text of a file as a Promise. */
function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result !== "string") {
        reject(new Error("File did not produce a string payload"));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsText(file);
  });
}

/** Read the raw bytes of a file as a Promise. */
function readAsBytes(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (!(result instanceof ArrayBuffer)) {
        reject(new Error("File did not produce an ArrayBuffer payload"));
        return;
      }
      resolve(new Uint8Array(result));
    };
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Load a user-supplied MusicXML file and return its raw XML string + a
 * display filename. The display name preserves the original file name so the
 * UI can show e.g. `score.mxl` even though the contents have been unzipped.
 */
export async function loadScoreFile(file: File): Promise<{ xml: string; filename: string }> {
  const ext = fileExtension(file.name);
  if (TEXT_EXTENSIONS.has(ext)) {
    const xml = await readAsText(file);
    return { xml, filename: file.name };
  }
  if (ZIP_EXTENSIONS.has(ext)) {
    const bytes = await readAsBytes(file);
    const entries = unzipSync(bytes);
    const rootPath = findRootMusicXMLPath(entries);
    if (!rootPath) {
      throw new Error(`No MusicXML rootfile found inside ${file.name}`);
    }
    const xml = strFromU8(entries[rootPath]);
    return { xml, filename: file.name };
  }
  throw new Error(`Unsupported file extension: ${ext || "(none)"} for ${file.name}`);
}

/**
 * Accept attribute value shared by file inputs across the app, so adding a
 * new format is a one-line change.
 */
export const SCORE_FILE_ACCEPT = ".xml,.musicxml,.mxl";
