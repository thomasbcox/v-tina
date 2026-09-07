import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAX_CHUNK_CHARS,
  MIN_CHUNK_CHARS,
  chunkText,
} from "../src/lib/ingest/chunk";
import { parseDocument } from "../src/lib/ingest/parse";
import { prepareDocument } from "../src/lib/ingest/pipeline";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

const LONG_FIXTURES = ["housing-order.md", "literacy-bill.md"];

describe("chunkText (AC1)", () => {
  it.each(LONG_FIXTURES)("%s: every chunk but the last is 500–1000 characters", (name) => {
    const chunks = chunkText(parseDocument(fixture(name)).body);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks.slice(0, -1)) {
      expect(chunk.length).toBeGreaterThanOrEqual(MIN_CHUNK_CHARS);
      expect(chunk.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
    }
    const last = chunks[chunks.length - 1];
    expect(last.length).toBeGreaterThan(0);
    expect(last.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
  });

  it.each(LONG_FIXTURES)("%s: the chunks concatenate back to exactly the body", (name) => {
    const body = parseDocument(fixture(name)).body;
    expect(chunkText(body).join("")).toBe(body);
  });

  it("ends chunks on paragraph boundaries wherever a paragraph fits", () => {
    // Paragraphs of ~300 characters: several fit in a chunk, so every chunk
    // boundary should land on a paragraph break, never mid-paragraph.
    const paragraph = "Placeholder sentence for the boundary test. ".repeat(7).trim();
    expect(paragraph.length).toBeLessThan(MIN_CHUNK_CHARS);
    const body = Array.from({ length: 12 }, () => paragraph).join("\n\n");
    const chunks = chunkText(body);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks.slice(0, -1)) {
      expect(chunk.endsWith("\n\n")).toBe(true);
    }
    expect(chunks.join("")).toBe(body);
  });

  it("cuts an over-long paragraph at a sentence end, not mid-sentence", () => {
    const sentence = "This is one placeholder sentence of moderate length. ";
    const body = sentence.repeat(60).trim();
    const chunks = chunkText(body);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks.slice(0, -1)) {
      expect(chunk.length).toBeGreaterThanOrEqual(MIN_CHUNK_CHARS);
      expect(chunk.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
      expect(/[.!?]\s$/.test(chunk)).toBe(true);
    }
    expect(chunks.join("")).toBe(body);
  });

  it("falls back to whitespace, then a hard cut, when there is no sentence end", () => {
    const words = "word ".repeat(400).trim();
    for (const chunk of chunkText(words).slice(0, -1)) {
      expect(chunk.length).toBeGreaterThanOrEqual(MIN_CHUNK_CHARS);
      expect(/\s$/.test(chunk)).toBe(true);
    }
    const solid = "x".repeat(2500);
    const chunks = chunkText(solid);
    expect(chunks.map((c) => c.length)).toEqual([1000, 1000, 500]);
    expect(chunks.join("")).toBe(solid);
  });

  it("returns a body shorter than the minimum as exactly one chunk", () => {
    const body = parseDocument(fixture("short-note.md")).body;
    expect(body.length).toBeLessThan(MIN_CHUNK_CHARS);
    expect(chunkText(body)).toEqual([body]);
  });
});

describe("prepareDocument (AC1)", () => {
  it.each(LONG_FIXTURES)("%s: chunks carry contiguous ordinals and the full source", (name) => {
    const markdown = fixture(name);
    const { source, body } = parseDocument(markdown);
    const chunks = prepareDocument(markdown);
    expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, i) => i));
    for (const chunk of chunks) expect(chunk.source).toEqual(source);
    expect(chunks.map((c) => c.content).join("")).toBe(body);
  });
});
