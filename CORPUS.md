# Corpus provenance

One row per document in `corpus/`. Every row records where the text came from, when it was
retrieved, the SHA-256 of the source file as retrieved, and how the text was extracted.

**Why the extraction method is recorded.** Documents marked `text-layer` carry their own digital
text and were extracted exactly. Documents marked `OCR` are published only as scanned page images
with no text layer, so their text was produced by optical character recognition and then
proofread against the page images. OCR can misread characters, so those documents carry a
different error profile and were checked more closely — see `reviews/seed-corpus-ingest.md`.

Checksums record the bytes downloaded on the retrieval date. A re-publication changes them
without necessarily changing the content, so treat a mismatch as a prompt to re-check rather than
as evidence of tampering.

| File | Title | Source | Retrieved | SHA-256 | Extraction |
|---|---|---|---|---|---|
| `eo-23-02.md` | EO 23-02: Declaring State of Emergency Due to Homelessness | https://www.oregon.gov/gov/eo/eo-23-02.pdf | 2026-09-08 | `06abc11867cacba07825930b6b1743f73e90a646c8de237110feae9f2866018a` | OCR |
| `eo-23-04.md` | EO 23-04: Establishing a Statewide Housing Production Goal and Housing Production Advisory Council | https://www.oregon.gov/gov/eo/eo-23-04.pdf | 2026-09-08 | `f8fcad4003962d7c8cdf1ef7d7d4db6c11090acf40252e413920ae8d0b69d703` | OCR |
| `eo-24-02.md` | EO 24-02: Merge and Extend Executive Order 23-02 and Executive Order 23-09 | https://www.oregon.gov/gov/eo/eo-24-02.pdf | 2026-09-08 | `9cda906ef3be0fbde6530b88455fc8cbaaf7bbce5667dacbffc79d333955f6bf` | OCR |
| `hb-2001.md` | HB 2001 (2023): An Act relating to housing (Oregon Laws 2023, chapter 13) | https://www.oregonlegislature.gov/bills_laws/lawsstatutes/2023orLaw0013.pdf | 2026-09-08 | `fb524f1717abdd31dfdc5bb730877fe6f0b9b18325031f7e0058b05212b9a41d` | text-layer |
| `sb-1537.md` | SB 1537 (2024): An Act relating to housing (Oregon Laws 2024, chapter 110) | https://www.oregonlegislature.gov/bills_laws/lawsstatutes/2024orLaw0110.pdf | 2026-09-08 | `d4af92e46829464b46b91a3d3d5148460ba624a1537c71d89f0a52c9494b401d` | text-layer |
| `eo-24-07.md` | EO 24-07: Declaring State of Emergency Due to Fentanyl Use in Portland City Center in Multnomah County | https://www.oregon.gov/gov/Documents/Text-Only-Gov-EXECUTIVE-ORDER-FENTANYL.pdf | 2026-09-08 | `4351d54a6b639c6ece15131bd79c06f6ca14290f8c912b5165646ed8b91344eb` | text-layer |
| `hb-4002.md` | HB 4002 (2024): An Act relating to the addiction crisis in this state (Oregon Laws 2024, chapter 70) | https://www.oregonlegislature.gov/bills_laws/lawsstatutes/2024orLaw0070.pdf | 2026-09-08 | `53b8e9a94451dab626203b569879fba8cd9c1f002c318d302727099641608392` | text-layer |
| `measure-110.md` | Ballot Measure 110 (2020): Drug Addiction Treatment and Recovery Act (Oregon Laws 2021, chapter 2) | https://www.oregonlegislature.gov/bills_laws/lawsstatutes/2021orLaw0002.pdf | 2026-09-08 | `fac840c4c8fd3d62b67d734d58f8248401b00e071d10d6d45911880840b92297` | text-layer |
| `sb-755.md` | SB 755 (2021): An Act relating to substance use (Oregon Laws 2021, chapter 591) | https://www.oregonlegislature.gov/bills_laws/lawsstatutes/2021orLaw0591.pdf | 2026-09-08 | `490bb9a4a1b5c375bc8a5a6fe0cc676c35fa9ad4bd2f808a20089c00512c2783` | text-layer |
| `eo-25-09.md` | EO 25-09: Personal Electronic Device Policy for School Districts | https://www.oregon.gov/gov/eo/eo-25-09.pdf | 2026-09-08 | `40621a2003ec8c6e45dee34e20e8b378dc90df1fecfeaf2f298161957a9709b4` | OCR |
| `hb-3198.md` | HB 3198 (2023): An Act relating to early literacy (Oregon Laws 2023, chapter 534) | https://www.oregonlegislature.gov/bills_laws/lawsstatutes/2023orLaw0534.pdf | 2026-09-08 | `8b27e204d4655d9d156e25713ae93801d8602a7c7726ed2b9a8d14b9fe3ff178` | text-layer |
