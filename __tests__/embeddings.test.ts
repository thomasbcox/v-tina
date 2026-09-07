import { describe, expect, it } from "vitest";
import {
  EMBEDDING_BATCH_SIZE,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  EmbeddingError,
  FIREWORKS_EMBEDDINGS_URL,
  createFireworksEmbedder,
} from "../src/lib/embeddings";

const vector = (seed: number) =>
  Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (seed * 1000 + i) / 1e6);

type Sent = { url: string; init: RequestInit; body: { model: string; input: string[] } };

/** A fetch that records requests and answers per the given handler. */
function fakeFetch(
  respond: (sent: Sent) => { status?: number; json: unknown } = (sent) => ({
    json: { data: sent.body.input.map((_, index) => ({ index, embedding: vector(index) })) },
  }),
) {
  const sent: Sent[] = [];
  const fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Sent["body"];
    const record = { url: String(url), init: init ?? {}, body };
    sent.push(record);
    const { status = 200, json } = respond(record);
    return new Response(JSON.stringify(json), { status });
  }) as typeof globalThis.fetch;
  return { fetch, sent };
}

describe("createFireworksEmbedder", () => {
  it("posts the prefixed texts to the embeddings endpoint with the key and model", async () => {
    const { fetch, sent } = fakeFetch();
    const embed = createFireworksEmbedder({ apiKey: "k", task: "document", fetch });
    const out = await embed(["alpha", "beta"]);
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe(FIREWORKS_EMBEDDINGS_URL);
    expect(new Headers(sent[0].init.headers).get("authorization")).toBe("Bearer k");
    expect(sent[0].body.model).toBe(EMBEDDING_MODEL);
    expect(sent[0].body.input).toEqual(["search_document: alpha", "search_document: beta"]);
    expect(out).toEqual([vector(0), vector(1)]);
  });

  it("uses the query prefix for queries", async () => {
    const { fetch, sent } = fakeFetch();
    await createFireworksEmbedder({ apiKey: "k", task: "query", fetch })(["q"]);
    expect(sent[0].body.input).toEqual(["search_query: q"]);
  });

  it("returns vectors in input order even when the response is out of order", async () => {
    const { fetch } = fakeFetch((s) => ({
      json: { data: s.body.input.map((_, index) => ({ index, embedding: vector(index) })).reverse() },
    }));
    const out = await createFireworksEmbedder({ apiKey: "k", task: "document", fetch })(["a", "b", "c"]);
    expect(out).toEqual([vector(0), vector(1), vector(2)]);
  });

  it("makes no request for an empty input", async () => {
    const { fetch, sent } = fakeFetch();
    expect(await createFireworksEmbedder({ apiKey: "k", task: "document", fetch })([])).toEqual([]);
    expect(sent).toHaveLength(0);
  });

  it("splits long inputs into batches and concatenates the results in order", async () => {
    const { fetch, sent } = fakeFetch();
    const texts = Array.from({ length: EMBEDDING_BATCH_SIZE + 3 }, (_, i) => `t${i}`);
    const out = await createFireworksEmbedder({ apiKey: "k", task: "document", fetch })(texts);
    expect(sent.map((s) => s.body.input.length)).toEqual([EMBEDDING_BATCH_SIZE, 3]);
    expect(out).toHaveLength(texts.length);
    expect(out[EMBEDDING_BATCH_SIZE]).toEqual(vector(0));
  });

  it.each([
    ["an HTTP failure", () => ({ status: 500, json: {} }), /HTTP 500/],
    ["a vector of the wrong length", (s: Sent) => ({ json: { data: s.body.input.map((_, index) => ({ index, embedding: [1, 2, 3] })) } }), /dimensions/],
    ["a missing vector", (s: Sent) => ({ json: { data: s.body.input.slice(1).map((_, index) => ({ index, embedding: vector(index) })) } }), /indices/],
    ["a duplicated index", (s: Sent) => ({ json: { data: s.body.input.map(() => ({ index: 0, embedding: vector(0) })) } }), /indices/],
    ["a response of the wrong shape", () => ({ json: { embeddings: [] } }), /expected shape/],
  ])("refuses %s", async (_label, respond, pattern) => {
    const { fetch } = fakeFetch(respond);
    const embed = createFireworksEmbedder({ apiKey: "k", task: "document", fetch });
    await expect(embed(["a", "b"])).rejects.toThrow(pattern);
    await expect(embed(["a", "b"])).rejects.toBeInstanceOf(EmbeddingError);
  });
});
