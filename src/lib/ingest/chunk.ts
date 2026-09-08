/**
 * Chunking: a document body → ordered sections of 500–1000 characters.
 *
 * Pure. The chunks concatenate back to exactly the input, so nothing is lost or
 * duplicated; a test holds that property. Boundaries prefer, in order: a
 * paragraph break, a sentence end, whitespace, and only then a hard cut — a
 * chunk that ends mid-sentence is a worse passage to retrieve than a shorter one.
 */

export const MIN_CHUNK_CHARS = 500;
export const MAX_CHUNK_CHARS = 1000;

/** Splits into paragraphs, each carrying the blank-line separator that followed
 *  it, so joining the pieces reproduces the input exactly. */
function paragraphs(body: string): string[] {
  const parts = body.split(/(\n[ \t]*\n+)/);
  const pieces: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const text = parts[i] + (parts[i + 1] ?? "");
    if (text.length > 0) pieces.push(text);
  }
  return pieces;
}

/**
 * The best index at which to cut `text` so the left part is between `min` and
 * `max` characters: the last sentence end in that window, else the last
 * whitespace, else `max`.
 */
function cutPoint(text: string, min: number, max: number): number {
  const window = text.slice(0, max);
  const sentenceEnd = /[.!?]["')\]]?\s/g;
  let best = -1;
  for (const m of window.matchAll(sentenceEnd)) {
    const at = m.index + m[0].length;
    if (at >= min && at <= max) best = at;
  }
  if (best !== -1) return best;
  for (let i = max; i >= min; i--) {
    if (/\s/.test(window[i - 1]) && !/\s/.test(window[i] ?? "")) return i;
  }
  return max;
}

export function chunkText(body: string): string[] {
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current.length > 0) chunks.push(current);
    current = "";
  };

  for (let piece of paragraphs(body)) {
    while (piece.length > 0) {
      if (current.length + piece.length <= MAX_CHUNK_CHARS) {
        current += piece;
        piece = "";
        continue;
      }
      // Adding all of the piece would overflow.
      if (current.length >= MIN_CHUNK_CHARS) {
        flush();
        continue;
      }
      // The current chunk is still short: fill it from the piece up to the limit.
      const room = MAX_CHUNK_CHARS - current.length;
      const need = MIN_CHUNK_CHARS - current.length;
      const at = cutPoint(piece, need, room);
      current += piece.slice(0, at);
      piece = piece.slice(at);
      flush();
    }
    // A completed paragraph ends the chunk when the chunk is already big enough,
    // so chunks end on paragraph boundaries wherever one fits.
    if (current.length >= MIN_CHUNK_CHARS) flush();
  }
  flush();
  return chunks;
}
