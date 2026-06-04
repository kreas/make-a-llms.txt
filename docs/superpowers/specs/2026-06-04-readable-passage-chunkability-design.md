# Readable Passage Chunkability — Design

**Date:** 2026-06-04
**Pillar:** Readable (AEO)
**Status:** Approved

## Goal

Deepen the Readable pillar with two new deterministic, page-level checks that
measure **passage chunkability** — how cleanly a page's content can be split
into self-contained passages for AI retrieval and citation. Pages that are walls
of text, or that bury hundreds of words under a single heading, are hard for
answer engines to extract and cite. These checks reward content that is broken
into retrieval-sized chunks.

## Context

The Readable pillar is powered by the existing `citation-audit` engine
(`src/lib/citation-audit/`). Each signal is a self-contained `CheckModule`
(`{ ID, WEIGHT, check(parsed, ctx) }`) — a pure function over a `ParsedPage`
(DOM, headings, links, article text). Checks are registered in
`checks/index.ts`, weighted in `rubric.ts`, and bucketed into pillars via
`pillars.ts` (`PILLAR_OF`). Scores aggregate per page (`score.ts`), per pillar
(`scorePillar`), and into a site rollup (`site-readiness.ts`). The UI renders
every check automatically in an accordion (`citations-page-detail.tsx`), keyed
off a `CHECK_LABEL` map.

Adding a check is therefore a pure-code extension with **no migration and no
scoring rebalance** — `aggregate` normalizes by the sum of weights present, so
new checks simply join the readable pool at parity with the existing structural
checks. This mirrors the GEO signal-registry pattern from Recommendable.

**Current Readable coverage (8 checks):** answer-position, freshness,
question-h2s, h1-present, heading-hierarchy, definitions, readability,
internal-links. Passage chunkability is a genuine gap — nothing currently
measures paragraph or section sizing.

## Scope

Two new checks, both deterministic (no LLM, no network):

1. `paragraph-length` — penalize walls of text
2. `section-chunking` — reward content broken into retrieval-sized spans by headings

Explicitly **out of scope** (deferred): content-depth/thin-content, alt-text
coverage, answer-formatting (TL;DR/FAQ blocks), in-page anchors/TOC.

## Architecture & data flow

`parse.ts` gains two pre-computed fields on `ParsedPage`, derived from the
**Readability-cleaned article DOM** when available (so nav/footer boilerplate is
excluded), falling back to the full document when Readability finds no article:

```ts
// added to ParsedPage
paragraphs: string[];                       // text of each <p> in main content
sections: {                                 // content spans split at each heading
  level: number | null;                     // heading level; null = lead content before first heading
  heading: string | null;                   // heading text; null = lead content
  wordCount: number;                        // words of body text in this span (excludes the heading text)
}[];
```

**Why pre-compute in the parser:** keeps the check modules pure and trivially
testable, consistent with how `headings`/`links`/`article` are already derived
once in `parse.ts`.

**Word counting:** a shared helper `countWords(text): number` splits on
whitespace (`text.trim().split(/\s+/).filter(Boolean).length`). Lives alongside
the parser or in a small `text.ts` util so both checks and the parser share one
definition.

**Section extraction:** walk the article DOM (or `document.body`) children in
document order. Maintain a running word count; each time a heading
(`h1`–`h6`) is encountered, close the current span and start a new one keyed to
that heading. Body text accumulated before the first heading becomes a section
with `heading: null, level: null`. The heading's own text is not counted toward
any section's `wordCount`.

Everything downstream is automatic: per-page score → `scorePillar('readable')`
→ site readiness rollup → accordion UI.

## Check 1 — `paragraph-length` (weight 5)

Penalizes walls of text; retrieval models want short, self-contained passages.

- **Constant:** `LONG_PARAGRAPH_WORDS = 130`. (Research: ideal paragraph is
  40–100 words; 75–150 is the "chunks well" ceiling; 130 catches genuine walls
  while sparing normal 3–5 sentence paragraphs.)
- **Constant:** `WALL_FRACTION_PASS = 0.15`.
- **Metric:** `long` = paragraphs whose word count > `LONG_PARAGRAPH_WORDS`;
  `total` = paragraph count; `longFraction = long / total`.
- **Score (graduated):** `score = clamp(0, 100, round(100 - longFraction * 200))`
  (25% long → 50; 50%+ long → 0; 0% → 100).
- **passed:** `longFraction <= WALL_FRACTION_PASS`.
- **Edge — zero paragraphs:** `passed: true, score: 100`, evidence
  `"No prose paragraphs to evaluate."` (No walls to penalize; thin-content is a
  separate, deferred signal.)
- **Evidence (failing):** `"3 of 18 paragraphs exceed 130 words (longest: 240)."`
- **Recommendation:** `"Break up long paragraphs (over 130 words) into shorter,
  self-contained passages so AI models can extract and cite them cleanly."`

## Check 2 — `section-chunking` (weight 5)

Rewards content broken into retrieval-sized spans by headings.

- **Constant:** `LONG_SECTION_WORDS = 400`. (Research: ideal retrieval chunk is
  200–400 words / 256–512 tokens; flag only sections that exceed one clean
  chunk and risk being split mid-thought. A 300-word section is itself an ideal
  chunk, so 300 would over-flag.)
- **Constant:** `SHORT_PAGE_WORDS = 400` — pages with less total body text than
  this have nothing to chunk.
- **Metric:** `totalWords` = sum of section word counts;
  `long` = sections with `wordCount > LONG_SECTION_WORDS`;
  `total` = section count; `longFraction = long / total`.
- **Score (graduated):** `score = clamp(0, 100, round(100 - longFraction * 200))`.
- **passed:** `long === 0`.
- **Edge — short page:** if `totalWords < SHORT_PAGE_WORDS`,
  `passed: true, score: 100`, evidence `"Page is short enough to chunk cleanly."`
- **Edge — no headings at all:** the entire body is one section with
  `heading: null`. If its `wordCount > LONG_SECTION_WORDS`, this fails (score 0),
  which is the intended worst case — one undifferentiated blob.
- **Evidence (failing):** `"2 sections exceed 400 words without a subheading
  (largest: \"Our Process\" — 520 words)."` (Lead-content section is reported as
  "intro / no heading".)
- **Recommendation:** `"Add subheadings to break long sections (over 400 words)
  into retrieval-sized chunks AI models can pull from."`

## Weights & scoring impact

Two checks at weight 5 each (matching `h1-present` / `heading-hierarchy`).
Readable-pillar weight 55 → 65; `RUBRIC_WEIGHTS_TOTAL` 100 → 110. Because
`aggregate` normalizes by present weights, nothing rebalances — the two new
signals join the readable pool at parity. Any test asserting the old total
(100) or readable-check count (8) is updated to the new values (110, 10).

## Error handling

Checks are pure and total — no throws, no I/O. Missing/empty content degrades
gracefully to the documented pass cases. No new failure modes; the audit
pipeline (`run.ts`, fetch, persistence) is untouched.

## Testing

- **`parse.test.ts`** — `paragraphs` and `sections` extraction: lead content
  before first heading, multiple headings, no headings (single blob), no-article
  Readability fallback, heading text excluded from section word counts.
- **`checks/paragraph-length.test.ts`** — all-short (pass/100), mixed
  (graduated score), majority-walls (0), zero-paragraph edge.
- **`checks/section-chunking.test.ts`** — well-chunked (pass), one over-long
  section (fail), short-page edge (pass), no-headings blob (fail).
- **Engine tests** — update `rubric.test.ts`, `pillars.test.ts`,
  `site-readiness.test.ts` for the new total/count and readable-pillar
  membership.
- **UI** — add `CHECK_LABEL` entries:
  - `paragraph-length` → "Paragraphs are passage-sized"
  - `section-chunking` → "Sections are well-chunked"

## Files

- Modify: `src/lib/citation-audit/types.ts` (add `paragraphs`, `sections` to `ParsedPage`)
- Modify: `src/lib/citation-audit/parse.ts` (compute `paragraphs`, `sections`; shared `countWords`)
- Create: `src/lib/citation-audit/checks/paragraph-length.ts` (+ test)
- Create: `src/lib/citation-audit/checks/section-chunking.ts` (+ test)
- Modify: `src/lib/citation-audit/checks/index.ts` (register both)
- Modify: `src/lib/citation-audit/rubric.ts` (two weight-5 entries)
- Modify: `src/lib/citation-audit/pillars.ts` (`PILLAR_OF`: both → `readable`)
- Modify: `src/components/citations/citations-page-detail.tsx` (`CHECK_LABEL` entries)
- Modify: engine tests as noted above
