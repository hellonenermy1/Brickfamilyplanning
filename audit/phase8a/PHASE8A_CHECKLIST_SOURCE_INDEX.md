# Brick V1 — Phase 8A Final Acceptance Checklist Source Index

## Source identity

Source: `Brick_V1_Final_Product_AI_Acceptance_Checklist.pdf`

Library file ID: `file_0000000067fc8207919ec23e2d735f3a`

Library version: `1`

Pages: `146`

PDF SHA-256:

`863218723ba49c93a72d4e5e59854425ac1bf32dbebeeae15bca08db96ea6f5e`

Full extracted text SHA-256:

`ddca0e0ea2937722a828daea8c072c125c1ef5d06c5be96dbf49aea9b4cb0293`

Generated parsed 469-row CSV SHA-256:

`8f65c92ffeec1d36e36c349e576340a067a907708aefd0d2b1bc9bd4730669c1`

The parsed CSV is an audit working artifact derived deterministically from the source PDF. The PDF remains the authoritative source; no manually copied large CSV is treated as authority.

## Checklist totals

Machine extraction of the complete 146-page source produced exactly:

- Audit points: **469**
- Unique IDs: **469**
- MANDATORY: **429**
- FORBIDDEN: **24**
- OPTIONAL-IF-SUPPORTED: **14**
- FUTURE-INTERFACE: **2**
- Independent pass criteria stated by source: **1,876**

These totals exactly match the checklist cover.

## Domain/prefix reconciliation

| Prefix | Count |
|---|---:|
| ACT | 18 |
| ATL | 43 |
| BE | 20 |
| COV | 12 |
| CUI | 16 |
| DAT | 28 |
| DPM | 13 |
| FUS | 18 |
| GOV | 15 |
| HIS | 20 |
| LOC | 22 |
| MOT | 18 |
| NO | 14 |
| OPS | 12 |
| PLT | 21 |
| PORT | 33 |
| QA | 31 |
| REL | 31 |
| SAFE | 18 |
| SEC | 25 |
| SHZ | 21 |
| WIT | 20 |
| **TOTAL** | **469** |

## Extraction verification

The source was checked in three ways:

1. full-text extraction of all 146 pages;
2. deterministic ID/class/profile parsing over the full extracted text;
3. selected page visual/text inspection, including the safety/fall section, to verify extraction semantics against the rendered PDF.

No duplicate checklist IDs were found.

## Authority / precedence

This checklist is a much more complete V1 acceptance source than the older Phase 1 ledger because it includes later 23P/23Q requirements such as fall detection, emergency evidence, additional reliability/System Truth functions and multi-device portal behavior.

However, it is **not allowed to silently override newer explicitly approved amendments**. Where the later master plan changes semantics (for example one-shot Location control, child override, current notification rules, OneMap-first map architecture, Deep Off/deprovision), the later approved amendment wins and the checklist row is marked superseded/amended in the Phase 8A reconciliation ledger.

## Release rule inherited from source

The checklist itself states that `PRODUCTION QUALIFIED` requires all mandatory C1-C4 criteria to pass, optional items to pass or be `VERIFIED UNSUPPORTED` on target hardware, forbidden paths to be proven absent, coverage-closure items to pass, and no critical blocker to remain.

Phase 8A uses the 469 IDs as the comprehensive checklist baseline, then applies newer approved amendments and resolves conflicts before publishing the final current V1 contract.
