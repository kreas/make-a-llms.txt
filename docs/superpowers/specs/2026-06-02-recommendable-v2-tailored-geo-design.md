# Recommendable v2 — Tailored, Site-Aware GEO Audit

> **Parent specs:** `docs/superpowers/specs/2026-06-01-ai-readiness-three-pillars-design.md` (north star) and `docs/superpowers/specs/2026-06-02-ai-readiness-phase-2-geo-design.md` (the v1 GEO audit this reworks). This document supersedes the v1 Recommendable flow.

**Goal:** Make the Recommendable tab adapt to the *kind* of site it's analyzing — a blog is judged on author credibility and sources, a SaaS on pricing and comparisons — through an auto-detected, user-confirmed first run; a fuller async crawl; an extensible signal registry; and a charts-forward results view.

**Status:** Design approved (brainstorming complete). Next: implementation plan.

---

## 1. Motivation

v1 (Phase 2) shipped a working GEO audit, but with two limits the user flagged:

1. **The signals aren't universal.** Pricing / competitor-comparison / case-study are SaaS-shaped. For a blog, a local business, or a store, they mostly false-negative and the recommendations read wrong.
2. **The first run is a cold button.** A generic "Run GEO analysis" with no context. Better to learn what the site *is* first, then ask the right questions.

v2 fixes both, adds richer crawling (so we stop missing signal pages the llms.txt generation never included), and makes the result visually legible. Competitor reference: Nuwtonic's lightweight "pick your pain" intent step and tailored framing.

## 2. Resolved decisions (from brainstorming)

1. **Auto-detect type, user confirms.** No standalone "analyze" button. Opening the tab on a never-analyzed site auto-runs cheap **discovery** (classify the site), landing the user on a **confirm card**, then results. Two visible steps.
2. **Type + goal.** The confirm card shows the auto-detected, editable **site type** plus a one-tap **goal** (`Get cited` / `Win comparisons` / `Build trust`). Goal tunes weights and recommendation order — it never changes which signals run.
3. **Universal core + per-type bonus signals.** Every site is scored on a small recommendable-specific core (`social-proof`, `differentiation`); each type layers 2-3 bonus signals on top.
4. **Registry + profile extensibility.** Signals are self-contained registered modules; site types are data-only profiles referencing signal ids; goals boost by tag. Adding a signal or type is pure code — no migration, no scoring rebalance.
5. **Async Cloudflare `/crawl` job.** Analysis runs as a background job using Cloudflare Browser Rendering's `/crawl` endpoint (sitemap discovery + `includePatterns` for signal-relevant URLs). The panel shows live progress; the user can navigate away. This reverses v1's synchronous model and removes the hard dependency on a prior generation.
6. **Charts where they fit.** A radial score gauge (Recommendable score), per-signal weight bars, and a three-pillar radar on the Overview — built on shadcn/Recharts. Charts summarize; the pass/fail checklist and extracted artifacts still carry the detail.
7. **v1 scope:** ship the full framework + the universal core + the **SaaS** profile (migrate v1's three signals into the registry) + the **publisher/blog** profile (three new signals). `ecommerce` / `local` / `services` are profiles added later; if detected now, the site is scored on core only with a "more signals coming" note.

## 3. Site types and goals

**Types (v1 taxonomy):** `saas` · `ecommerce` · `local` · `publisher` · `services` · `other`. Profiles exist for all six (so the classifier can name them), but only `saas`, `publisher`, and `other` (core-only) have full signal sets in v1.

**Goals:** `get-cited` · `win-comparisons` · `build-trust`.

## 4. Signal model & extensibility architecture

### 4.1 A signal is a registered module

```ts
// src/lib/geo-audit/signals/<id>.ts
export type GeoSignalDef = {
  id: string;                 // 'pricing', 'author-credibility', …
  label: string;              // UI label
  tags: SignalTag[];          // 'proof' | 'comparison' | 'evidence' | 'trust' | 'value'
  defaultWeight: number;      // pre-normalization weight
  /** URL globs handed to the crawl's includePatterns, e.g. ['**/pricing**','**/plans**']. */
  urlPatterns: string[];
  /** Cheap per-page heuristic gate over crawled markdown → candidate or null. */
  gate: (page: GeoPageInput) => GateMatch | null;
  /** LLM confirm system prompt; must return { confirmed, artifact }. */
  confirmPrompt: (entityName: string) => string;
  /** Shown when the signal is absent. */
  recommendation: string;
};
```

All signals are collected into `SIGNAL_REGISTRY: Record<string, GeoSignalDef>` (a `CHECKS`-style array import, matching the existing citation-audit registration pattern). **Adding a signal = add one module + register it.**

### 4.2 A site type is a data-only profile

```ts
// src/lib/geo-audit/profiles.ts
export const UNIVERSAL_CORE = ['social-proof', 'differentiation'] as const;

export type SiteTypeProfile = {
  id: SiteType;
  label: string;
  detectionHint: string;        // fed to the classifier prompt
  bonusSignals: string[];       // signal ids layered on the core; [] = core only
};

export const PROFILES: Record<SiteType, SiteTypeProfile> = {
  saas:      { …, bonusSignals: ['pricing', 'comparison', 'case-study'] },
  publisher: { …, bonusSignals: ['author-credibility', 'cited-sources', 'original-data'] },
  ecommerce: { …, bonusSignals: [] },   // signals added later
  local:     { …, bonusSignals: [] },
  services:  { …, bonusSignals: [] },
  other:     { …, bonusSignals: [] },
};

export const activeSignalIds = (type: SiteType): string[] =>
  [...UNIVERSAL_CORE, ...PROFILES[type].bonusSignals];
```

### 4.3 Goals boost by tag (so new signals auto-participate)

```ts
export const GOAL_BOOSTS: Record<Goal, { tags: SignalTag[]; multiplier: number }> = {
  'get-cited':       { tags: ['evidence'],   multiplier: 1.5 },
  'win-comparisons': { tags: ['comparison', 'value'], multiplier: 1.5 },
  'build-trust':     { tags: ['proof', 'trust'], multiplier: 1.5 },
};
```

A signal participates in a goal's boost iff its `tags` intersect the goal's `tags`. Adding a signal with the right tags needs no goal-map edit.

### 4.4 Normalized scoring

Active sets vary in size, so we normalize instead of hand-balancing to 100:

```
effectiveWeight(sig) = sig.defaultWeight × (GOAL_BOOSTS[goal] applies to sig.tags ? multiplier : 1)
score = round( Σ(effectiveWeight · present) / Σ(effectiveWeight) × 100 )   // over the active set
tier  = tierFor(score)        // reuse existing boundaries; cleared at 70
```

Adding a signal to a profile can never break the 0–100 scale.

### 4.5 v1 signal definitions

**Universal core (recommendable-specific; deliberately NOT Readable/Recognized concerns):**
- `social-proof` (tags: proof, trust) — testimonials, reviews, ratings, or named endorsements exist.
- `differentiation` (tags: value) — a clear "why us / what's different" positioning statement.

**SaaS bonus (migrated from v1):**
- `pricing` (value) · `comparison` (comparison) · `case-study` (evidence, proof).

**Publisher bonus (new):**
- `author-credibility` (trust) — bylines + author bios / credentials (E-E-A-T).
- `cited-sources` (evidence) — outbound citations / references to primary sources.
- `original-data` (evidence) — first-party research, data, or original analysis.

## 5. Discovery (classification)

`classifySite()` returns `{ siteType: SiteType, confidence: number }` from one cheap structured LLM call (`google/gemini-3.1-flash-lite`, `Output.object`). Inputs, in priority order:

1. **If a succeeded generation exists** (common case): the page-type histogram (counts of `homepage/service/product/article/case_study/about/other` from stored page summaries) + `site.description`. Instant, no fetch.
2. **Else:** fetch the homepage markdown via the existing single-page `browser-rendering/markdown` (`fetchPageMarkdown`) and classify from that.

The classifier prompt is generated from `PROFILES` (`label` + `detectionHint`), so adding a type teaches the classifier automatically. Low confidence (< 0.5) → the confirm card shows type **unset** with a "pick one" prompt rather than a wrong guess.

## 6. Analysis — async Cloudflare crawl job

On **Analyze** (confirm card submit), the server persists `siteType`/`goal` to the site, creates a `site_geo_audit` row with `status: 'pending'`, and starts a background job. The panel polls `GET …/geo-audit/latest` (~3s) and renders progress from the row's `status` + `stage`.

**Crawl step** — Cloudflare Browser Rendering `/crawl`:
```
POST https://api.cloudflare.com/client/v4/accounts/<acct>/browser-rendering/crawl
{
  url: <site.rootUrl>,
  source: 'sitemaps',                       // fall back to 'links' if no sitemap
  formats: ['markdown'],
  render: false,                            // free beta; escalate to true only if pages come back empty
  limit: 60,
  crawlPurposes: ['ai-input'],
  options: { includePatterns: [...activeSignalUrlPatterns, '**/', '**/about**'] }
}
→ { result: { id } }                        // poll GET …/crawl/{id} until status 'completed'
```
`includePatterns` is the union of every active signal's `urlPatterns` plus the homepage and `/about` (for the core signals). This keeps the crawl small and on-budget while guaranteeing signal-relevant pages are seen even if the llms.txt generation skipped them.

**Confirm + score step** — over the crawl's `records[].markdown`: run each active signal's `gate`, cap candidates per signal at 5, `confirmCandidate` (existing LLM confirm, now driven by the signal's `confirmPrompt`), then normalized scoring (§4.4). Persist the final result and set `status: 'succeeded'`.

**Background mechanism:** a Vercel Workflow (WDK), the same primitive the generation pipeline uses. Define `runGeoAuditWorkflow` (`'use workflow'`) with `'use step'` stages (crawl → confirm → score → persist) and start it from the POST route via `start(runGeoAuditWorkflow, [{ auditId }])` (re-exported from `@/lib/workflow/wdk`), exactly like `enqueue-generations.ts` starts `generateSiteFilesWorkflow`. Store the returned `runId` on the audit row as `workflowRunId`. Each step updates the row's `status`/`stage` so crawl + confirm survive request timeouts and the panel never blocks. Use `RetryableError` for transient crawl/LLM failures and `FatalError` for unrecoverable ones.

**Failure & resilience:** any step failure persists `status: 'failed'` with an `errorReason` (`crawl_failed` / `analysis_failed` / `no_pages`), mirroring v1's hardening. A later failed run never erases a prior succeeded score — `latest` already prefers the most recent succeeded audit (carried over from v1).

## 7. Data model

**`sites`** — two new nullable columns (added once; nothing else needs migration to grow types/signals):
- `siteType text` — last confirmed type.
- `geoGoal text` — last chosen goal.

**`site_geo_audits`** — extend the v1 table:
- `status` enum gains `'pending'` and `'running'` (SQLite stores text; this is a TS-enum widening, no column change).
- add `crawlJobId text` (Cloudflare crawl job id), `workflowRunId text` (WDK run id, mirroring `generations.workflowRunId`), `stage text` (`'crawling' | 'confirming' | 'scoring'` for progress), `siteType text`, `goal text`.
- `results` JSON now carries `{ siteType, goal, signals: GeoSignalResult[], score, tier, metadata }` so each audit is self-describing.

`GeoSignalResult` gains `label` and `tags` (denormalized for display); otherwise unchanged from v1.

## 8. API

- `POST /api/sites/:id/geo-audit/classify` — discovery only; returns `{ suggestedType, confidence }`. No writes. Synchronous, cheap.
- `POST /api/sites/:id/geo-audit` — body `{ siteType, goal }`. Persists to the site, creates a `pending` row, starts the background crawl job, returns the row. **(Replaces v1's synchronous run.)**
- `GET /api/sites/:id/geo-audit/latest` — unchanged contract (prefers latest succeeded); now also used for polling in-flight runs via `status`/`stage`.

## 9. UI

**Recommendable panel — states:**
1. **Discovering** (auto on first open): thin "reading your crawled pages…" loader → confirm card.
2. **Confirm card:** editable site-type chip (+ confidence/evidence line), one-tap goal, **Analyze**. Low-confidence → type unset.
3. **Running:** progress from `status`/`stage` ("Discovered N pages → crawling patterns → confirming candidates → scoring"), "you can leave and come back."
4. **Results:** radial score gauge + per-signal weight bars + the pass/fail checklist with extracted artifacts and links; "Re-run / change type" affordance. Return visits land here directly (cached; discovery does not re-run).

**Overview:** the Recommendable card stays live; additionally a **three-pillar radar** (Readable / Recommendable / Recognized) visualizes the overall AI-readiness shape.

**Charts:** add the shadcn `chart` component (`pnpm dlx shadcn@latest add chart`, Recharts). Radial gauge = `RadialBarChart`; radar = `RadarChart`. Per-signal weight bars can be plain tokenized divs (no chart lib needed). Every component gets a test (project rule).

## 10. Migration from v1

The v1 `src/lib/geo-audit/` modules are refactored, not discarded:
- `gates.ts` → per-signal `gate` functions inside signal modules; the shared regexes move with them.
- `confirm.ts` → generalized to accept a signal's `confirmPrompt` (already close).
- `analyze.ts` → operates over the active signal set + crawled records; scoring becomes normalized + goal-weighted.
- `run.ts` → becomes the async job orchestrator (start crawl → poll → confirm → score → persist with status/stage) instead of a synchronous run.
- `score.ts` → normalized, goal-aware scoring.
- v1's three signals become registry modules under the `saas` profile; behavior is preserved.
- `site-readiness.ts` already sources Recommendable from the GEO audit; unchanged except the result now includes `siteType`/`goal`.

## 11. Out of scope (YAGNI / later)

- `ecommerce` / `local` / `services` signal sets (profiles exist; signals added in follow-ups).
- Competitor SERP scraping / Nuwtonic-style competitive dumps (still excluded by the parent spec).
- Cloudflare `/crawl` `formats: ['json']` AI-extraction (we keep our own gate+confirm for control; revisit later).
- `render: true` by default (start with the free `render: false`; escalate per-site only if pages return empty).
- Auto-fix / CMS write-back.

## 12. Open questions

### Resolved
- **Background job mechanism** — use the existing Vercel Workflow (WDK) pattern, as in §6. Background jobs are acceptable here.
- **Progress granularity** — ship the `stage` enum only for v1; per-candidate counts in the running UI are deferred to a follow-up.

### Tuning during implementation
- **Crawl `limit`** — 60 is a starting point; tune against real sites and the free-beta budget.
- **Classifier confidence threshold** — 0.5 for "show unset" is a starting value.
