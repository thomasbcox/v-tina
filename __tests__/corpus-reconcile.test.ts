import { describe, expect, it } from "vitest";
import { documentsToRemove } from "../src/lib/ingest/corpus";

/**
 * The rule that decides what gets DELETED from the store. Tested as a pure
 * function rather than through the operator command, because its failure mode
 * is silent data loss.
 */
describe("documentsToRemove", () => {
  const A = "https://www.oregon.gov/gov/eo/eo-23-02.pdf";
  const B = "https://www.oregon.gov/gov/eo/eo-23-04.pdf";
  const C = "https://oregonlegislature.gov/bills_laws/lawsstatutes/2024orLaw0070.pdf";

  it("removes a stored document the corpus no longer contains", () => {
    expect(documentsToRemove([A, B], [A])).toEqual([B]);
  });

  it("removes nothing when the store and the corpus agree", () => {
    expect(documentsToRemove([A, B], [B, A])).toEqual([]);
  });

  it("removes nothing when the store is empty", () => {
    expect(documentsToRemove([], [A, B])).toEqual([]);
  });

  it("treats a corrected url as a removal of the old one", () => {
    expect(documentsToRemove([A], [C])).toEqual([A]);
  });

  it("never proposes removing a url the corpus still has, even listed twice", () => {
    expect(documentsToRemove([A, A, B], [A])).toEqual([B]);
  });

  // The dangerous case: an empty corpus list would propose deleting everything.
  // The rule itself is honest about that; the operator command is what must
  // refuse to act on it, and does — it prunes only after a full, clean run.
  it("proposes removing everything when the corpus list is empty", () => {
    expect(documentsToRemove([A, B], [])).toEqual([A, B].sort());
  });
});
