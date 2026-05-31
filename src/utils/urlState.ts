/**
 * URL-fragment encoder/decoder for shareable DiffLizst diff state.
 *
 * ## Scheme
 *
 * The fragment is a standard query-string written after `#`:
 *
 *   `#left=<scoreId>&right=<scoreId>[&detailed=1][&palette=1][&ws=1][&ctx=<n>]`
 *
 * Key mapping:
 *   - `left`     → leftId       (string, required for a meaningful link)
 *   - `right`    → rightId      (string, required for a meaningful link)
 *   - `detailed` → detailedDiff (boolean — present as `1`, omitted when false)
 *   - `palette`  → colorblindPalette (same convention)
 *   - `ws`       → ignoreWhitespace  (same convention)
 *   - `ctx`      → contextLines (integer decimal string; omitted when not set)
 *
 * ## Scope limitation — BUNDLED SCORES ONLY
 *
 * Score IDs are short alphanumeric slugs (e.g. "Chopin-etudeOp10No1").  They
 * are not user-supplied file names and contain no characters that need
 * percent-encoding, keeping the fragment under 200 chars for typical pairs.
 *
 * User-uploaded files cannot be encoded.  Callers are responsible for
 * displaying a "this diff includes a local file" disclaimer when either ID
 * originates from a file upload rather than the bundled sample list.
 */

export interface ShareableState {
  leftId: string;
  rightId: string;
  detailedDiff?: boolean;
  colorblindPalette?: boolean;
  ignoreWhitespace?: boolean;
  contextLines?: number;
}

/**
 * Encodes a `ShareableState` into a URL fragment string (including the leading `#`).
 *
 * Boolean flags are omitted entirely when falsy — they only appear as `=1`.
 * `contextLines` is omitted when undefined.
 */
export function encodeState(state: ShareableState): string {
  const params = new URLSearchParams();

  params.set("left", state.leftId);
  params.set("right", state.rightId);

  if (state.detailedDiff) params.set("detailed", "1");
  if (state.colorblindPalette) params.set("palette", "1");
  if (state.ignoreWhitespace) params.set("ws", "1");
  if (state.contextLines !== undefined) params.set("ctx", String(state.contextLines));

  return `#${params.toString()}`;
}

/**
 * Parses a URL fragment back into a `Partial<ShareableState>`.
 *
 * - Tolerates missing keys — only recognised keys with valid values are returned.
 * - A non-integer `ctx` value is silently dropped (no throw).
 * - Unknown keys are ignored.
 * - An empty or whitespace-only input returns `{}`.
 *
 * @param hash - The raw fragment string, with or without the leading `#`.
 */
export function decodeState(hash: string): Partial<ShareableState> {
  const stripped = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!stripped.trim()) return {};

  const params = new URLSearchParams(stripped);
  const result: Partial<ShareableState> = {};

  const left = params.get("left");
  if (left !== null && left !== "") result.leftId = left;

  const right = params.get("right");
  if (right !== null && right !== "") result.rightId = right;

  if (params.get("detailed") === "1") result.detailedDiff = true;
  if (params.get("palette") === "1") result.colorblindPalette = true;
  if (params.get("ws") === "1") result.ignoreWhitespace = true;

  const ctx = params.get("ctx");
  if (ctx !== null) {
    const parsed = Number.parseInt(ctx, 10);
    if (!Number.isNaN(parsed)) result.contextLines = parsed;
  }

  return result;
}
