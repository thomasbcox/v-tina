import type { PolicyChunk } from "../../types";
import type { EmbedFn } from "../embeddings";
import { chunkText } from "./chunk";
import { parseDocument } from "./parse";

/**
 * The ingestion pipeline: markdown → validated metadata → chunks → embeddings →
 * one document-scoped store replacement.
 *
 * Every stage is pure or takes its I/O as an injected dependency, so the unit
 * suite runs the whole pipeline with fakes. Errors propagate: nothing here is
 * caught, logged, or turned into a success-shaped result with an error field —
 * a caller that awaits `ingestDocument` either gets a result or an exception.
 */

/** A chunk ready to embed: everything a stored row carries except its id. */
export type DocumentChunk = Omit<PolicyChunk, "id">;

/** A chunk with its embedding, ready to store. */
export interface NewPolicyChunk extends DocumentChunk {
  embedding: number[];
}

/** Where chunks go. One document-scoped, all-or-nothing operation: the store
 *  ends up holding exactly `rows` for `url` — never a stale tail from an
 *  earlier, longer version, never a partial set after a failure — and reports
 *  how many rows it confirmed. An empty `rows` therefore REMOVES the document
 *  and confirms 0; that is the intended path for a withdrawn source, and the
 *  pipeline itself never takes it (an empty document is refused before
 *  embedding). The Supabase implementation is in `src/lib/supabase.ts`. */
export interface ChunkStore {
  replaceDocument(url: string, rows: NewPolicyChunk[]): Promise<number>;
}

export interface IngestDeps {
  embed: EmbedFn;
  store: ChunkStore;
}

export interface IngestResult {
  url: string;
  /** The count the store confirmed, which equals the chunk count. */
  chunkCount: number;
}

export class IngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestError";
  }
}

/** Parse and chunk, no I/O: the document's chunks in order, each carrying the
 *  complete source metadata. Throws `DocumentValidationError` on a bad document. */
export function prepareDocument(markdown: string): DocumentChunk[] {
  const { source, body } = parseDocument(markdown);
  return chunkText(body).map((content, chunkIndex) => ({
    content,
    chunkIndex,
    source,
  }));
}

export async function ingestDocument(
  markdown: string,
  deps: IngestDeps,
): Promise<IngestResult> {
  const chunks = prepareDocument(markdown);
  const url = chunks[0].source.url;

  const embeddings = await deps.embed(chunks.map((c) => c.content));
  if (embeddings.length !== chunks.length) {
    throw new IngestError(
      `embedding service returned ${embeddings.length} vectors for ${chunks.length} chunks`,
    );
  }

  const rows: NewPolicyChunk[] = chunks.map((chunk, i) => ({
    ...chunk,
    embedding: embeddings[i],
  }));

  const confirmed = await deps.store.replaceDocument(url, rows);
  if (confirmed !== rows.length) {
    throw new IngestError(
      `store confirmed ${confirmed} of ${rows.length} chunks for ${url}`,
    );
  }

  return { url, chunkCount: confirmed };
}
