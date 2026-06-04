# AI Readiness — Enhancements Backlog (scratch)

> Cross-session reference for future work on the AI Readiness feature set.
> Not committed to any feature PR — a living scratch doc. Promote items into
> proper specs (`docs/superpowers/specs/`) + plans (`docs/superpowers/plans/`)
> as they're picked up. Last updated: 2026-06-04.

## Orientation (how the system is laid out)

Three pillars, each scored 0–100 and rolled up into a site readiness view:

- **Readable (AEO)** — per-page `citation-audit` engine. Deterministic `CheckModule`s
  (`{ ID, WEIGHT, check(parsed, ctx) }`) over a `ParsedPage`, registered in
  `src/lib/citation-audit/checks/index.ts` + `rubric.ts` (weights) +
  `pillars.ts` (`PILLAR_OF`). UI: `citations-page-detail.tsx` accordion
  (friendly names in `CHECK_LABEL`). Adding a check = pure code, no migration;
  `aggregate` normalizes by present weight so nothing rebalances.
  Current: 10 checks, readable pillar weight 65.
- **Recommendable (GEO)** — `src/lib/geo-audit/`. Signal registry
  (`SIGNAL_REGISTRY`) + data-only site-type `PROFILES` + goal weight boosts.
  Cloudflare `/crawl` → analyze (LLM confirm, bounded-concurrency) → score.
  Background via Vercel Workflow (WDK). UI: `recommendable-panel.tsx`.
- **Recognized (AIO)** — *largely untouched*. Currently only a few checks live
  in the citation-audit `recognized` pillar (schema-type, named-entities,
  entity-first-paragraph, schema-fields, meta-description, canonical; weight 40).
  No dedicated tab/engine like the other two.
- **Setup / crawlability** — llms.txt, robots.txt, AI-crawler access; lives in
  the Setup tab. Foundational hygiene that feeds all pillars.

Model note: GEO uses `google/gemini-3.1-flash-lite` via the AI Gateway with
`thinkingConfig.thinkingBudget: 0`. The slug uses DOTS in the minor version
(`3.1`) — this is correct and verified; do NOT "fix" it to dashes despite lint
hooks flagging it.

---

## A. Readable (AEO) — deepen further

Chunkability just shipped (PR #15: `paragraph-length`, `section-chunking`).
Remaining gaps from the earlier signal-group analysis (user picked only
chunkability for that round):

1. **Content depth / thin-content** *(high value, deterministic, medium effort)*
   Detect thin pages and low semantic density (word count, words-per-section,
   content-to-boilerplate ratio). AI models skip thin pages.
   **Why it matters now:** the new `paragraph-length` check is *inert* on
   raw-`<div>` pages that bypass Readability (no `<p>` → "no prose paragraphs"
   → vacuous pass). A thin-content check is the proper backstop for those pages.
2. **Answer formatting** *(high value, medium effort)*
   Reward a TL;DR / summary / key-takeaways block near the top, and explicit
   FAQ/Q&A structure (beyond the existing `question-h2s`). Strong AEO signal.
3. **Alt-text & media coverage** *(lower AEO value, small effort)*
   % of images with meaningful alt text. Requires adding image parsing to
   `ParsedPage`. More accessibility/completeness than citation impact.

### Readable robustness follow-ups (from PR #15 final review)
- **`<p>`-only paragraph source** under-counts on the Readability-null fallback
  path (raw-div pages → 0 paragraphs). Acceptable today; the thin-content check
  (A.1) is the real fix.
- **Footer/nav text counts on the fallback path** — when Readability returns
  null, `extractSections` runs on full `document.body`, so boilerplate can
  inflate a section over 400 words. Low impact (fallback pages already score
  poorly). Could scope to a main-content heuristic if it becomes noticeable.
- **`Section.level` is Readability-normalized** (it rewrites `<h1>`→`<h2>` in
  cleaned content). Documented in `text.ts`. Nothing consumes `level` yet; if a
  future check needs true source levels, read them from the full-document
  `headings` array instead.

---

## B. Recognized (AIO) — biggest net-new surface

The one pillar without its own engine/tab. Candidate first build:

- **Schema.org validation** — validate `Organization`, `Product`,
  `AggregateRating`, `Article`/`BlogPosting`, `FAQPage`, `BreadcrumbList`
  presence + required-field completeness (we already have `jsonld` parsing in
  `src/lib/jsonld/` and `validators/`).
- **Entity consistency** — name/brand consistency across pages; `sameAs` links
  to Wikipedia/Wikidata/Crunchbase (knowledge-graph anchors).
- **Knowledge-graph presence** — does the entity resolve to a known KG node?
- Likely its own tab mirroring Recommendable's shape (or a deeper expansion of
  the existing recognized checks). Worth a brainstorm to decide engine vs.
  extend-citation-audit.

---

## C. Setup / crawlability

- **ai.txt + robots.txt + sitemap health** — validate AI-crawler directives
  (GPTBot, ClaudeBot, PerplexityBot, Google-Extended), sitemap freshness/coverage.
- **llms.txt discoverability** — is it present, well-formed, linked?
- **JS-vs-native-HTML rendering check** — does primary content render without
  JS? (AI crawlers largely don't execute JS.) High-signal "new mechanism" factor.
- **Core Web Vitals** — LCP/INP/CLS as a ranking-adjacent signal (chrome-devtools
  MCP / lighthouse available).

---

## D. Cross-cutting GEO factors (Recommendable深化)

From the broader GEO rubric the user pasted earlier — not all in one go:
- **External mentions / off-site signals** — brand mentions, citations elsewhere.
- **Native-HTML-vs-JS** (shared with C) for GEO context.
- **Topical authority graph** — internal linking depth around a topic cluster.
(Several core GEO factors — topical-depth, verifiable-proofs, expertise/E-E-A-T,
ratings-reviews — already shipped in Recommendable v2.)

---

## E. Polish / harden (existing features)

- **Gateway connect timeout** — the AI Gateway's ~10s connect timeout aborted a
  GEO audit once. We added per-confirm tolerance (fail only if ALL fail). If it
  recurs, raise the connect timeout via a custom fetch dispatcher
  (undici `Agent({ connect: { timeout } })`) on the gateway client.
- **Crawl progress in UI** — surface live page-count / stage during a GEO crawl
  (we have `stage` + `crawlJobId` on the audit row already).
- **Retry affordance on failed audits** — one-click re-run for a failed GEO audit
  (the `latest` route now returns latest-any, so failures are visible).
- **Recommendable pillar is thin** in the citation-audit rubric (single
  `lists-tables` check, weight 5). Pre-existing; revisit if the per-page
  recommendable sub-score matters alongside the full geo-audit.

---

## F. Tech debt (separate from features)

- **Pre-existing lint debt** — `pnpm lint` reports ~34 errors / ~30 warnings in
  files unrelated to recent work: `src/lib/llmstxt.ts`,
  `src/lib/services/generations.ts`, `src/lib/workflow/steps.test.ts`,
  `src/test/e2e/generation-happy-path.test.ts`, and a file with
  `no-explicit-any` at 97/101/108. Worth a dedicated cleanup pass (mostly
  `no-explicit-any`, `prefer-const`, unused vars). NOT blocking; out of scope of
  feature PRs.

---

## Suggested next pick

If continuing the Readable thread: **A.1 content-depth/thin-content** (closes the
raw-div gap left by chunkability, deterministic, fits the same engine).
For breadth: **B. Recognized pillar** (largest untouched surface, needs a
brainstorm first to decide engine shape).
