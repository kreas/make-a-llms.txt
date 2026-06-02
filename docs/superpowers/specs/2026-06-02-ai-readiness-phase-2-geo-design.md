# AI Readiness — Phase 2 (Recommendable / GEO) Design

> **Parent north star:** `docs/superpowers/specs/2026-06-01-ai-readiness-three-pillars-design.md` (§7 Phase 2). This document is the detailed spec for the Recommendable pillar and inherits the parent's motivation, IA, and scoring philosophy.

**Goal:** Detect and score the *defensible evidence* an AI can cite when recommending a business — does the site publish pricing, competitor comparisons, and case studies with real metrics — and surface that as a live Recommendable health score.

**Status:** Design approved (brainstorming complete). Next step: implementation plan.

---

## 1. Motivation

Phase 1 reframed the product around three pillars (Readable → Recommendable → Recognized) but shipped Recommendable as a "coming soon" placeholder — it had a single seed signal (`lists-tables`), not enough for a meaningful score. Phase 2 makes Recommendable real.

The Readable pillar answers "can an AI parse and quote this page?". Recommendable answers a different question: **when an AI is asked to recommend a vendor, does this site give it the evidence to pick you?** That evidence is concrete and checkable — a public pricing page, pages that name competitors directly, case studies with specific numbers.

## 2. Core architecture decisions (resolved in brainstorming)

1. **Hybrid scope — page signals, site verdict.** GEO signals are site-level existence questions ("does the site have a pricing page?"), not per-page checks. Per-page heuristics emit raw signals; a new site-level layer computes the Recommendable score from existence/coverage logic, not a per-page mean.
2. **Heuristic gate + LLM confirm.** A cheap deterministic scan over all crawled pages finds candidate pages per signal. A single LLM call per candidate confirms it is genuine and extracts the artifact. LLM cost is bounded to a handful of candidate pages per site, not every page.
3. **On-demand trigger.** A "Run GEO analysis" button in the Recommendable tab runs the site pass over the latest generation's pages. The user controls when the LLM-confirm cost is spent. Result is cached (latest-wins) until re-run.
4. **Three existence signals first.** Pricing, competitor comparison, and case-study-with-metric. Structured-evidence (richer `lists-tables`) is deferred — the per-page `lists-tables` check already provides a partial signal and can fold in later.
5. **LLM confirms existence and extracts.** Each confirm returns a yes/no plus the artifact (competitor names, headline metric, price tier) so the UI can show concrete evidence ("Case study: 40% faster onboarding").

## 3. The three signals

| Signal | Weight | Heuristic gate (over all pages) | LLM confirm (per candidate) |
|---|---|---|---|
| **Public pricing** | 40 | URL matches `/pricing`, `/plans`; OR body has currency amounts (`$\d`, `€\d`) near plan keywords (`/mo`, `per month`, `starting at`, `free tier`) | "Is this a real pricing page showing at least one visible price or named tier?" → extract `priceHint` (e.g. "from $29/mo") |
| **Competitor comparison** | 30 | URL matches `/vs/`, `/compare`, `/alternatives`, `/alternative-to`; OR heading contains "X vs Y" or "alternative to" | "Does this page compare against a specifically named competitor?" → extract `competitors: string[]` |
| **Case study w/ metric** | 30 | URL matches `/case-stud`, `/customers`, `/success`; OR body has a metric pattern (`\d+%`, `\d+x`, `$\d[\d,]*`, `\d+ (hours\|days\|weeks)`) within ~200 chars of testimonial language ("results", "achieved", "increased", "reduced") | "Is this a genuine customer case study with a concrete outcome metric?" → extract `metric` (e.g. "40% faster onboarding") |

All three are **existence signals**: the site scores the full weight if at least one confirmed page exists for that signal, zero otherwise. (Coverage-based partial credit is a deferred refinement — see §8.)

## 4. Data flow

```
POST /api/sites/:id/geo-audit
  1. Resolve the latest succeeded generation; load its pages manifest (URLs + blob paths).
  2. Read each page's stored markdown (already crawled — no re-fetch).
  3. Heuristic gate: scan every page, bucket into candidate sets per signal.
     - Cap candidates per signal (e.g. top 5 by gate strength) to bound LLM cost.
  4. LLM confirm: for each candidate, one generateText call (gemini-3.1-flash-lite,
     thinking disabled, structured Output schema) → { confirmed, artifact }.
  5. Compute Recommendable score from confirmed signals (§5).
  6. Persist one row in `site_geo_audits` (latest-wins per site).
  7. Return the verdict to the client.
```

Input source: the **stored crawl markdown** from the latest generation, not a live re-fetch. This reuses what the crawl already captured and keeps the pass fast and cheap. If no succeeded generation exists, the endpoint returns a clear "run a generation first" state.

LLM call budget: bounded by candidate caps. Worst case ≈ 3 signals × 5 candidates = 15 calls; typical ≈ 2–6 calls. Uses the same model and `thinkingBudget: 0` provider option established in the llms.txt formatting fix.

## 5. Scoring

The Recommendable pillar score becomes a **site-level composite**, replacing the per-page mean for this pillar only:

```
score = 40·hasPricing + 30·hasComparison + 30·hasCaseStudyMetric
  where each term is 1 if ≥1 confirmed page exists for that signal, else 0
  → integer 0–100
tier = tierFor(score)   // reuses the existing 0–100 tier boundaries
```

Examples: pricing + comparison confirmed, no case study → 70 (cleared). Pricing only → 40. Nothing → 0.

The pillar-cleared threshold stays at **70** (consistent with Phase 1's `stageStatus`).

### Integration with existing per-pillar scoring

- `pillars.ts` / `scorePillar()` continues to drive Readable and Recognized from per-page checks.
- For Recommendable, the Overview and pillar rollup read the **latest `site_geo_audit`** instead of `scorePillar('recommendable')`. If no GEO audit has run yet, Recommendable shows a "not yet analyzed" state (score null), not zero.
- The per-page `lists-tables` check is unchanged and still appears in the per-page Citation Audit detail. Its `PILLAR_OF` mapping is retired from driving the pillar score (the site GEO audit owns it now); revisit when structured-evidence is folded in.

## 6. Persistence

New table `site_geo_audits`, mirroring `citationAudits` but site-scoped:

```
id            integer pk autoincrement
uid           text unique
siteId        integer → sites.id
generationId  integer → generations.id   (which crawl it analyzed)
status        'succeeded' | 'failed'
score         integer       (0–100, null on failure)
tier          'poor'|'fair'|'good'|'excellent'
results       text (JSON)   — full SiteGeoAuditResult: per-signal {confirmed, candidates, artifact, evidence, recommendation}
errorReason   text
errorMessage  text
llmMsUsed     integer
fetchedAt     text default current_timestamp
trigger       'manual'
```

Indexes: `bySiteRecent (siteId, fetchedAt)`. Latest-wins dedup in the `/latest` read, same pattern as citation audits.

API:
- `POST /api/sites/:id/geo-audit` — run the pass, persist, return the result.
- `GET  /api/sites/:id/geo-audit/latest` — return the most recent result (null if never run).

## 7. UI

### Recommendable panel (replaces `ComingSoonPanel`)

- **Empty state:** "Run a GEO analysis to see whether AI has the evidence to recommend you." + **Run GEO analysis** button. Progress state while running (`Analyzing… ~15s`), matching the per-page audit's pending affordance.
- **Result state:** a three-row signal checklist using the same visual language as the Citation Audit panel:
  - ✓ **Pricing page found** — *from $29/mo* · [link to page]
  - ✗ **No competitor comparison** — recommendation: "Publish a 'You vs [competitor]' page…"
  - ✓ **2 case studies with metrics** — *"40% faster onboarding"* · [links]
- A **Re-run** button + "last analyzed {relativeTime}" once a result exists.

### Overview integration

- Recommendable card: static "coming soon" → live score (or "not yet analyzed" prompting a run).
- `pickNextAction`: begins including Recommendable gaps (currently excluded). A missing high-weight signal (no pricing page) can surface as the next action.
- `stageStatus`: narrative now spans all three pillars honestly.

## 8. Out of scope (YAGNI / deferred)

- **Structured-evidence signal** (the 4th, richer `lists-tables` coverage score) — deferred; current per-page `lists-tables` is a stand-in.
- **Coverage-based partial credit** — existence is binary in Phase 2 (≥1 confirmed page = full weight). Partial credit by count/ratio is a later refinement.
- **Live re-fetch of pages** during the GEO pass — we use stored crawl markdown.
- **Competitor SERP scraping / Nuwtonic-style competitive dumps** — explicitly excluded by the parent spec.
- **Auto-trigger during generation** — considered and rejected for cost control; on-demand only.

## 9. Touchpoints (existing code)

- `src/db/schema.ts` — add `siteGeoAudits` table + types.
- `src/lib/citation-audit/pillars.ts` — retire `lists-tables` from `PILLAR_OF` pillar scoring (or branch Recommendable to the GEO source).
- `src/lib/citation-audit/site-readiness.ts` — `sitePillarScores` / `pickNextAction` read the GEO audit for Recommendable.
- `src/components/generations/overview-panel.tsx` — live Recommendable card + next-action inclusion.
- `src/app/(app)/sites/[id]/site-detail-client.tsx` — Recommendable tab content swaps `ComingSoonPanel` → new panel.
- **New:** `src/lib/geo-audit/` (heuristic gates, LLM confirm, scoring, run), `src/app/api/sites/[id]/geo-audit/` routes, `src/components/generations/recommendable-panel.tsx`.

## 10. Open questions (resolve during implementation)

1. **Candidate cap per signal** — start at 5; tune against real sites.
2. **Pricing on a single-page site** — when pricing is a section of the homepage, not a dedicated page, does the heuristic gate catch it? (Body-keyword gate should; validate.)
3. **`lists-tables` pillar reassignment** — confirm retiring it from `PILLAR_OF` doesn't leave Readable/Recognized math off; it currently contributes only to Recommendable.
