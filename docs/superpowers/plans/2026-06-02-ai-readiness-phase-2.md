# AI Readiness Phase 2 (Recommendable / GEO) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a site-level GEO ("Recommendable") audit that detects whether a site publishes pricing, competitor comparisons, and case studies with real metrics, scores it, and surfaces it as a live pillar with its own panel.

**Architecture:** A new `src/lib/geo-audit/` module runs over the latest generation's crawled page markdown. Cheap deterministic heuristic *gates* nominate candidate pages per signal; a bounded LLM *confirm* step verifies each candidate and extracts an artifact (price hint, competitor names, headline metric). Three existence signals (pricing 40, comparison 30, case-study 30) sum to a 0–100 score persisted in a new `site_geo_audits` table. The Recommendable pillar reads this audit; the per-page Citation Audit system is untouched.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM (libsql/SQLite), Vercel AI SDK (`generateText` + `Output.object`) via AI Gateway (`google/gemini-3.1-flash-lite`), TanStack Query, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-02-ai-readiness-phase-2-geo-design.md`

---

## File Structure

**New — `src/lib/geo-audit/` (each file one responsibility):**
- `types.ts` — shared types + signal weights. No logic.
- `gates.ts` — pure heuristic gates over one page → candidate matches.
- `score.ts` — pure existence scoring of confirmed signals → `{score, tier}`.
- `confirm.ts` — the single LLM confirm call per candidate (the only impure/LLM file).
- `analyze.ts` — orchestrates gate → confirm → per-signal results → score. Confirm fn is injected (testable without the LLM).
- `run.ts` — resolves the latest generation, reads page bodies, calls `analyzeGeoPages`, persists a row.
- `serialize.ts` — DB row → client JSON.

**New — API + UI:**
- `src/app/api/sites/[id]/geo-audit/route.ts` — POST run.
- `src/app/api/sites/[id]/geo-audit/latest/route.ts` — GET latest.
- `src/components/generations/recommendable-panel.tsx` — the panel (+ test).

**Modified:**
- `src/db/schema.ts` — add `siteGeoAudits` table + types.
- `src/lib/citation-audit/site-readiness.ts` — Recommendable reads GEO; ladder-aware `pickNextAction`; `stageStatus` covers all three pillars.
- `src/components/generations/overview-panel.tsx` — live Recommendable card + GEO next-action labels.
- `src/app/(app)/sites/[id]/site-detail-client.tsx` — swap `ComingSoonPanel` → `RecommendablePanel`.

**Decision (resolves spec §10 q3):** `lists-tables` STAYS mapped in `PILLAR_OF` so it keeps showing in the per-page Citation Audit detail. It no longer *drives* the Recommendable pillar score (the GEO audit overrides it) and does not produce a next-action (GEO signals do). No `PILLAR_OF` edit needed.

---

## Task 1: GEO types and heuristic gates

**Files:**
- Create: `src/lib/geo-audit/types.ts`
- Create: `src/lib/geo-audit/gates.ts`
- Test: `src/lib/geo-audit/gates.test.ts`

- [ ] **Step 1: Write the types file**

Create `src/lib/geo-audit/types.ts`:

```ts
import type { Tier } from '@/lib/citation-audit/types';

export type GeoSignalId = 'pricing' | 'comparison' | 'case-study';

/** Existence weights — sum to 100 so a score is already 0–100 (spec §5). */
export const GEO_SIGNAL_WEIGHTS: Record<GeoSignalId, number> = {
  pricing: 40,
  comparison: 30,
  'case-study': 30,
};

export const GEO_SIGNALS: readonly GeoSignalId[] = ['pricing', 'comparison', 'case-study'] as const;

export type GeoPageInput = {
  url: string;
  path: string;
  markdown: string;
};

/** A heuristic gate firing: this page is a candidate for one signal. */
export type GateMatch = {
  signal: GeoSignalId;
  url: string;
  path: string;
  reason: string;
};

/** LLM confirm output for one candidate page. */
export type GeoConfirm = {
  confirmed: boolean;
  artifact: string | null;
};

export type GeoConfirmFn = (
  signal: GeoSignalId,
  page: GeoPageInput,
  entityName: string,
) => Promise<GeoConfirm>;

/** Per-signal verdict after gating + confirming. */
export type GeoSignalResult = {
  signal: GeoSignalId;
  weight: number;
  present: boolean;
  artifacts: string[];
  pages: string[];
  recommendation: string | null;
};

export type SiteGeoAuditResult = {
  score: number;
  tier: Tier;
  signals: GeoSignalResult[];
  metadata: { pagesScanned: number; candidates: number; confirmCalls: number };
};
```

- [ ] **Step 2: Write the failing test**

Create `src/lib/geo-audit/gates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { gatePage } from './gates';
import type { GeoPageInput } from './types';

const page = (over: Partial<GeoPageInput>): GeoPageInput => ({
  url: 'https://acme.test/',
  path: 'index',
  markdown: '',
  ...over,
});

describe('gatePage', () => {
  it('gates a pricing page by URL', () => {
    const m = gatePage(page({ url: 'https://acme.test/pricing' }));
    expect(m.map((x) => x.signal)).toContain('pricing');
  });

  it('gates a pricing page by body (price + plan keyword)', () => {
    const m = gatePage(page({ markdown: 'Plans start at $29/mo for the Pro tier.' }));
    expect(m.map((x) => x.signal)).toContain('pricing');
  });

  it('does not gate pricing on an incidental dollar mention', () => {
    const m = gatePage(page({ markdown: 'We donated $5 to charity last year.' }));
    expect(m.map((x) => x.signal)).not.toContain('pricing');
  });

  it('gates a comparison page by URL', () => {
    const m = gatePage(page({ url: 'https://acme.test/compare/acme-vs-beta' }));
    expect(m.map((x) => x.signal)).toContain('comparison');
  });

  it('gates a comparison page by "X vs Y" heading', () => {
    const m = gatePage(page({ markdown: '## Acme vs Beta\nA detailed look.' }));
    expect(m.map((x) => x.signal)).toContain('comparison');
  });

  it('gates a case study by URL and by metric + testimonial language', () => {
    expect(gatePage(page({ url: 'https://acme.test/customers/northwind' })).map((x) => x.signal)).toContain('case-study');
    expect(gatePage(page({ markdown: 'Northwind achieved 40% faster onboarding with our platform.' })).map((x) => x.signal)).toContain('case-study');
  });

  it('returns no matches for an ordinary page', () => {
    expect(gatePage(page({ markdown: 'About our founding story.' }))).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test gates.test`
Expected: FAIL — `gatePage` is not defined.

- [ ] **Step 4: Write the gates implementation**

Create `src/lib/geo-audit/gates.ts`:

```ts
import type { GateMatch, GeoPageInput } from './types';

const PRICING_URL = /\/(pricing|plans|pricing-plans)(\/|$|\?)/i;
const CURRENCY = /[$€£]\s?\d/;
const PLAN_KEYWORDS = /(per month|\/mo\b|\/month|per year|\/yr\b|starting at|starts at|free tier|free plan|billed annually|per seat)/i;

const COMPARISON_URL = /\/(vs|compare|comparison|alternatives?|alternative-to)(\/|-|$|\?)/i;
const COMPARISON_TEXT = /\b[\w][\w .&-]{1,30}\s+vs\.?\s+[\w][\w .&-]{1,30}\b|\balternatives?\s+to\b/i;

const CASE_STUDY_URL = /\/(case-stud(y|ies)|customers?|success-stor(y|ies)|customer-stor(y|ies))(\/|$|\?)/i;
const METRIC = /\b\d+(\.\d+)?\s?(%|x|×)\b|[$€£]\s?\d[\d,]*\b|\b\d+\s?(hours?|days?|weeks?|months?|minutes?)\b/i;
const TESTIMONIAL = /\b(results?|achieved|increased|reduced|decreased|improved|grew|saved|boosted|cut|faster|roi|conversion)\b/i;

export function gatePage(p: GeoPageInput): GateMatch[] {
  const matches: GateMatch[] = [];
  const text = p.markdown;
  const base = { url: p.url, path: p.path };

  if (PRICING_URL.test(p.url)) {
    matches.push({ ...base, signal: 'pricing', reason: 'URL looks like a pricing page' });
  } else if (CURRENCY.test(text) && PLAN_KEYWORDS.test(text)) {
    matches.push({ ...base, signal: 'pricing', reason: 'Page shows prices with plan terms' });
  }

  if (COMPARISON_URL.test(p.url)) {
    matches.push({ ...base, signal: 'comparison', reason: 'URL looks like a comparison page' });
  } else if (COMPARISON_TEXT.test(text)) {
    matches.push({ ...base, signal: 'comparison', reason: 'Text compares against another named option' });
  }

  if (CASE_STUDY_URL.test(p.url)) {
    matches.push({ ...base, signal: 'case-study', reason: 'URL looks like a case study' });
  } else if (METRIC.test(text) && TESTIMONIAL.test(text)) {
    matches.push({ ...base, signal: 'case-study', reason: 'Page contains an outcome metric' });
  }

  return matches;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test gates.test`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/geo-audit/types.ts src/lib/geo-audit/gates.ts src/lib/geo-audit/gates.test.ts
git commit -m "feat: add GEO audit types and heuristic gates"
```

---

## Task 2: GEO signal scoring

**Files:**
- Create: `src/lib/geo-audit/score.ts`
- Test: `src/lib/geo-audit/score.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/geo-audit/score.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { scoreGeoSignals } from './score';
import type { GeoSignalResult } from './types';

const sig = (signal: GeoSignalResult['signal'], weight: number, present: boolean): GeoSignalResult => ({
  signal, weight, present, artifacts: [], pages: [], recommendation: present ? null : 'do it',
});

describe('scoreGeoSignals', () => {
  it('sums weights of present signals', () => {
    const r = scoreGeoSignals([
      sig('pricing', 40, true),
      sig('comparison', 30, false),
      sig('case-study', 30, true),
    ]);
    expect(r.score).toBe(70);
    expect(r.tier).toBe('good');
  });

  it('scores zero when nothing is present', () => {
    const r = scoreGeoSignals([
      sig('pricing', 40, false),
      sig('comparison', 30, false),
      sig('case-study', 30, false),
    ]);
    expect(r.score).toBe(0);
    expect(r.tier).toBe('poor');
  });

  it('scores 100 when all present', () => {
    const r = scoreGeoSignals([
      sig('pricing', 40, true),
      sig('comparison', 30, true),
      sig('case-study', 30, true),
    ]);
    expect(r.score).toBe(100);
    expect(r.tier).toBe('excellent');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test score.test`
Expected: FAIL — `scoreGeoSignals` not defined. (Note: there is a `citation-audit/score.test.ts`; the filename filter `score.test` runs both — that's fine, just confirm the geo cases fail.)

- [ ] **Step 3: Write the implementation**

Create `src/lib/geo-audit/score.ts`:

```ts
import { tierFor } from '@/lib/citation-audit/rubric';
import type { Tier } from '@/lib/citation-audit/types';
import type { GeoSignalResult } from './types';

export function scoreGeoSignals(signals: GeoSignalResult[]): { score: number; tier: Tier } {
  const score = signals.reduce((sum, s) => sum + (s.present ? s.weight : 0), 0);
  return { score, tier: tierFor(score) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test score.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/geo-audit/score.ts src/lib/geo-audit/score.test.ts
git commit -m "feat: add GEO existence scoring"
```

---

## Task 3: GEO analyze orchestrator (gate → confirm → score)

**Files:**
- Create: `src/lib/geo-audit/analyze.ts`
- Test: `src/lib/geo-audit/analyze.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/geo-audit/analyze.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { analyzeGeoPages } from './analyze';
import type { GeoConfirmFn, GeoPageInput } from './types';

const pages: GeoPageInput[] = [
  { url: 'https://acme.test/pricing', path: 'pricing', markdown: 'Plans from $29/mo.' },
  { url: 'https://acme.test/customers/x', path: 'customers/x', markdown: 'Achieved 40% faster onboarding.' },
  { url: 'https://acme.test/about', path: 'about', markdown: 'Our story.' },
];

describe('analyzeGeoPages', () => {
  it('confirms gated candidates and scores present signals', async () => {
    const confirm: GeoConfirmFn = vi.fn(async (signal) => {
      if (signal === 'pricing') return { confirmed: true, artifact: 'from $29/mo' };
      if (signal === 'case-study') return { confirmed: true, artifact: '40% faster onboarding' };
      return { confirmed: false, artifact: null };
    });

    const result = await analyzeGeoPages(pages, 'Acme', confirm);

    const pricing = result.signals.find((s) => s.signal === 'pricing')!;
    const comparison = result.signals.find((s) => s.signal === 'comparison')!;
    const caseStudy = result.signals.find((s) => s.signal === 'case-study')!;

    expect(pricing.present).toBe(true);
    expect(pricing.artifacts).toContain('from $29/mo');
    expect(caseStudy.present).toBe(true);
    expect(comparison.present).toBe(false);
    expect(comparison.recommendation).not.toBeNull();
    expect(result.score).toBe(70); // pricing 40 + case-study 30
    expect(result.metadata.confirmCalls).toBe(2); // only 2 candidates gated
  });

  it('marks a signal absent when the LLM rejects every candidate', async () => {
    const confirm: GeoConfirmFn = vi.fn(async () => ({ confirmed: false, artifact: null }));
    const result = await analyzeGeoPages(pages, 'Acme', confirm);
    expect(result.signals.every((s) => !s.present)).toBe(true);
    expect(result.score).toBe(0);
  });

  it('caps candidates per signal at 5', async () => {
    const many: GeoPageInput[] = Array.from({ length: 8 }, (_, i) => ({
      url: `https://acme.test/customers/${i}`,
      path: `customers/${i}`,
      markdown: 'x',
    }));
    const confirm = vi.fn<GeoConfirmFn>(async () => ({ confirmed: false, artifact: null }));
    const result = await analyzeGeoPages(many, 'Acme', confirm);
    const caseStudyCalls = confirm.mock.calls.filter((c) => c[0] === 'case-study').length;
    expect(caseStudyCalls).toBe(5);
    expect(result.metadata.candidates).toBe(5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test analyze.test`
Expected: FAIL — `analyzeGeoPages` not defined.

- [ ] **Step 3: Write the implementation**

Create `src/lib/geo-audit/analyze.ts`:

```ts
import { gatePage } from './gates';
import { scoreGeoSignals } from './score';
import {
  GEO_SIGNALS,
  GEO_SIGNAL_WEIGHTS,
  type GeoConfirmFn,
  type GeoPageInput,
  type GeoSignalId,
  type GeoSignalResult,
  type SiteGeoAuditResult,
} from './types';

const CANDIDATE_CAP = 5;

const RECOMMENDATIONS: Record<GeoSignalId, string> = {
  pricing:
    'Publish a public pricing or plans page. AI cannot recommend you on value if it cannot see what you cost.',
  comparison:
    'Publish a "You vs [competitor]" or "alternatives to" page so AI has a sourced answer when buyers compare named rivals.',
  'case-study':
    'Publish a customer case study with a concrete outcome metric (a real %, multiple, time saved, or dollar figure).',
};

export async function analyzeGeoPages(
  pages: GeoPageInput[],
  entityName: string,
  confirm: GeoConfirmFn,
): Promise<SiteGeoAuditResult> {
  const candidatesBySignal: Record<GeoSignalId, GeoPageInput[]> = {
    pricing: [],
    comparison: [],
    'case-study': [],
  };
  for (const page of pages) {
    for (const match of gatePage(page)) {
      candidatesBySignal[match.signal].push(page);
    }
  }

  let candidates = 0;
  let confirmCalls = 0;
  const signals: GeoSignalResult[] = [];

  for (const signal of GEO_SIGNALS) {
    const pool = candidatesBySignal[signal].slice(0, CANDIDATE_CAP);
    candidates += pool.length;
    const artifacts: string[] = [];
    const confirmedPages: string[] = [];
    for (const page of pool) {
      confirmCalls += 1;
      const res = await confirm(signal, page, entityName);
      if (res.confirmed) {
        confirmedPages.push(page.url);
        if (res.artifact) artifacts.push(res.artifact);
      }
    }
    const present = confirmedPages.length > 0;
    signals.push({
      signal,
      weight: GEO_SIGNAL_WEIGHTS[signal],
      present,
      artifacts,
      pages: confirmedPages,
      recommendation: present ? null : RECOMMENDATIONS[signal],
    });
  }

  const { score, tier } = scoreGeoSignals(signals);
  return { score, tier, signals, metadata: { pagesScanned: pages.length, candidates, confirmCalls } };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test analyze.test`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/geo-audit/analyze.ts src/lib/geo-audit/analyze.test.ts
git commit -m "feat: add GEO analyze orchestrator with injectable confirm"
```

---

## Task 4: LLM confirm step

**Files:**
- Create: `src/lib/geo-audit/confirm.ts`
- Test: `src/lib/geo-audit/confirm.test.ts`

Mirrors the proven pattern in `src/lib/workflow/summarize-page.ts` (`google/gemini-3.1-flash-lite` + `Output.object`).

- [ ] **Step 1: Write the failing test**

Create `src/lib/geo-audit/confirm.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return { ...actual, generateText: vi.fn() };
});

import { generateText } from 'ai';
import { confirmCandidate } from './confirm';

describe('confirmCandidate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the structured output from the model', async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: { confirmed: true, artifact: 'from $29/mo' },
    } as never);

    const res = await confirmCandidate(
      'pricing',
      { url: 'https://acme.test/pricing', path: 'pricing', markdown: 'Plans from $29/mo.' },
      'Acme',
    );

    expect(res).toEqual({ confirmed: true, artifact: 'from $29/mo' });
    const call = vi.mocked(generateText).mock.calls[0][0];
    expect(call.model).toBe('google/gemini-3.1-flash-lite');
    expect(String(call.system)).toContain('PRICING');
  });

  it('passes the correct signal prompt for case-study', async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: { confirmed: false, artifact: null },
    } as never);
    await confirmCandidate(
      'case-study',
      { url: 'https://acme.test/x', path: 'x', markdown: 'y' },
      'Acme',
    );
    const call = vi.mocked(generateText).mock.calls[0][0];
    expect(String(call.system)).toContain('CASE STUDY');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test confirm.test`
Expected: FAIL — `confirmCandidate` not defined.

- [ ] **Step 3: Write the implementation**

Create `src/lib/geo-audit/confirm.ts`:

```ts
import { generateText, Output } from 'ai';
import { z } from 'zod';
import type { GeoConfirm, GeoPageInput, GeoSignalId } from './types';

const MODEL = 'google/gemini-3.1-flash-lite';
const MAX_INPUT_CHARS = 6000;

const confirmSchema = z.object({
  confirmed: z.boolean(),
  artifact: z.string().nullable(),
});

const SYSTEM: Record<GeoSignalId, (entity: string) => string> = {
  pricing: (e) =>
    `You audit whether a web page is a genuine PUBLIC PRICING page for ${e}. Set confirmed=true only if it shows at least one visible price or named plan/tier. If confirmed, set artifact to a short price hint like "from $29/mo · 3 tiers"; otherwise artifact=null. Reply only via the structured output.`,
  comparison: (e) =>
    `You audit whether a web page directly COMPARISON-compares ${e} against a specifically named competitor. Set confirmed=true only if at least one named competitor is compared head to head. If confirmed, set artifact to the competitor name(s), comma separated; otherwise artifact=null. Reply only via the structured output.`,
  'case-study': (e) =>
    `You audit whether a web page is a genuine customer CASE STUDY for ${e} containing a concrete outcome metric (a real number: %, multiple, time, or money). Set confirmed=true only if such a metric is present. If confirmed, set artifact to the headline metric like "40% faster onboarding"; otherwise artifact=null. Reply only via the structured output.`,
};

export async function confirmCandidate(
  signal: GeoSignalId,
  page: GeoPageInput,
  entityName: string,
): Promise<GeoConfirm> {
  const { output } = await generateText({
    model: MODEL,
    output: Output.object({ schema: confirmSchema }),
    system: SYSTEM[signal](entityName),
    prompt: `URL: ${page.url}\n\n---\n${page.markdown.slice(0, MAX_INPUT_CHARS)}\n---`,
    maxRetries: 3,
  });
  return { confirmed: output.confirmed, artifact: output.artifact };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test confirm.test`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/geo-audit/confirm.ts src/lib/geo-audit/confirm.test.ts
git commit -m "feat: add GEO LLM confirm step"
```

---

## Task 5: Database table and serializer

**Files:**
- Modify: `src/db/schema.ts` (after the `citationAudits` block, ~line 177)
- Create: `src/lib/geo-audit/serialize.ts`
- Test: `src/lib/geo-audit/serialize.test.ts`
- Generates: a new file under `drizzle/`

- [ ] **Step 1: Add the table to the schema**

In `src/db/schema.ts`, immediately after the `export type NewCitationAudit = ...` line, add:

```ts
export const siteGeoAudits = sqliteTable(
  'site_geo_audits',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uid: text('uid').notNull().unique().$defaultFn(generateUid),
    siteId: integer('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    generationId: integer('generation_id').references(() => generations.id, {
      onDelete: 'set null',
    }),
    status: text('status', { enum: ['succeeded', 'failed'] }).notNull(),
    score: integer('score'),
    tier: text('tier', { enum: ['poor', 'fair', 'good', 'excellent'] }),
    results: text('results'),
    errorReason: text('error_reason'),
    errorMessage: text('error_message'),
    llmMsUsed: integer('llm_ms_used'),
    fetchedAt: text('fetched_at').notNull().default(sql`(current_timestamp)`),
    trigger: text('trigger', { enum: ['manual'] }).notNull(),
  },
  (t) => ({
    bySiteRecent: index('geo_audit_by_site_recent').on(t.siteId, t.fetchedAt),
  }),
);

export type SiteGeoAudit = typeof siteGeoAudits.$inferSelect;
export type NewSiteGeoAudit = typeof siteGeoAudits.$inferInsert;
```

(Note: `generateUid`, `sites`, `generations`, `sqliteTable`, `index`, `integer`, `text`, `sql` are all already imported/defined in this file — `generations` and `sites` are declared earlier, so the forward references resolve.)

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: a new migration file appears in `drizzle/` containing `CREATE TABLE \`site_geo_audits\``.

- [ ] **Step 3: Apply the migration to the local DB**

Run: `pnpm db:migrate`
Expected: applies cleanly, no errors.

- [ ] **Step 4: Write the failing serializer test**

Create `src/lib/geo-audit/serialize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { serializeSiteGeoAudit } from './serialize';
import type { SiteGeoAudit } from '@/db/schema';

const row: SiteGeoAudit = {
  id: 1,
  uid: 'geo-uid-1',
  siteId: 10,
  generationId: 5,
  status: 'succeeded',
  score: 70,
  tier: 'good',
  results: JSON.stringify({ score: 70, tier: 'good', signals: [], metadata: { pagesScanned: 3, candidates: 2, confirmCalls: 2 } }),
  errorReason: null,
  errorMessage: null,
  llmMsUsed: 1200,
  fetchedAt: '2026-06-02T00:00:00Z',
  trigger: 'manual',
};

describe('serializeSiteGeoAudit', () => {
  it('uses the site uid and parses results JSON', () => {
    const out = serializeSiteGeoAudit(row, 'site-uid');
    expect(out.id).toBe('geo-uid-1');
    expect(out.siteId).toBe('site-uid');
    expect(out.score).toBe(70);
    expect(out.results?.metadata.pagesScanned).toBe(3);
  });

  it('returns null results when the column is null', () => {
    const out = serializeSiteGeoAudit({ ...row, results: null }, 'site-uid');
    expect(out.results).toBeNull();
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm test serialize.test`
Expected: FAIL — `serializeSiteGeoAudit` not defined (also runs the citation serialize test, which still passes).

- [ ] **Step 6: Write the serializer**

Create `src/lib/geo-audit/serialize.ts`:

```ts
import type { SiteGeoAudit } from '@/db/schema';
import type { SiteGeoAuditResult } from './types';

export function serializeSiteGeoAudit(a: SiteGeoAudit, siteUid: string) {
  return {
    id: a.uid,
    siteId: siteUid,
    status: a.status,
    score: a.score,
    tier: a.tier,
    fetchedAt: a.fetchedAt,
    llmMsUsed: a.llmMsUsed,
    errorReason: a.errorReason,
    errorMessage: a.errorMessage,
    results: a.results ? (JSON.parse(a.results) as SiteGeoAuditResult) : null,
  };
}

export type SerializedSiteGeoAudit = ReturnType<typeof serializeSiteGeoAudit>;
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm test serialize.test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/db/schema.ts drizzle/ src/lib/geo-audit/serialize.ts src/lib/geo-audit/serialize.test.ts
git commit -m "feat: add site_geo_audits table and serializer"
```

---

## Task 6: Run orchestrator (resolve generation, read pages, persist)

**Files:**
- Create: `src/lib/geo-audit/run.ts`
- Test: `src/lib/geo-audit/run.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/geo-audit/run.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users, generations, siteGeoAudits } from '@/db/schema';
import { eq } from 'drizzle-orm';

vi.mock('@/lib/blob', () => ({ get: vi.fn() }));
vi.mock('./confirm', () => ({ confirmCandidate: vi.fn() }));

import { get } from '@/lib/blob';
import { confirmCandidate } from './confirm';
import { runGeoAudit } from './run';

async function seed() {
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'U', email: 'u@u.test' }).returning();
  const [s] = await db.insert(sites).values({
    userId: u.id, name: 'Acme', rootUrl: 'https://acme.test',
    webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_acme',
  }).returning();
  const [g] = await db.insert(generations).values({
    siteId: s.id, userId: u.id, status: 'succeeded', trigger: 'manual',
    pagesManifestBlobPath: 'gens/1/pages/manifest.json',
  }).returning();
  return { site: s, gen: g };
}

function blobText(text: string) {
  return { stream: new Response(text).body };
}

describe('runGeoAudit', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  it('persists a succeeded audit from the latest generation pages', async () => {
    const { site } = await seed();
    const manifest = JSON.stringify({
      pages: [
        { url: 'https://acme.test/pricing', path: 'pricing', blobPath: 'b/pricing.md', status: 'ok' },
        { url: 'https://acme.test/about', path: 'about', blobPath: 'b/about.md', status: 'ok' },
      ],
    });
    vi.mocked(get).mockImplementation(async (p: string) => {
      if (p.endsWith('manifest.json')) return blobText(manifest) as never;
      if (p.endsWith('pricing.md')) return blobText('Plans from $29/mo.') as never;
      return blobText('Our story.') as never;
    });
    vi.mocked(confirmCandidate).mockResolvedValue({ confirmed: true, artifact: 'from $29/mo' });

    const row = await runGeoAudit({ siteId: site.id });

    expect(row.status).toBe('succeeded');
    expect(row.score).toBe(40); // pricing only
    const stored = await getDb().select().from(siteGeoAudits).where(eq(siteGeoAudits.siteId, site.id));
    expect(stored).toHaveLength(1);
  });

  it('fails gracefully when the site has no succeeded generation', async () => {
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'U', email: 'n@n.test' }).returning();
    const [s] = await db.insert(sites).values({
      userId: u.id, name: 'Empty', rootUrl: 'https://empty.test',
      webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_empt',
    }).returning();

    const row = await runGeoAudit({ siteId: s.id });
    expect(row.status).toBe('failed');
    expect(row.errorReason).toBe('no_generation');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test run.test`
Expected: FAIL — `runGeoAudit` not defined.

- [ ] **Step 3: Write the implementation**

Create `src/lib/geo-audit/run.ts`:

```ts
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sites, generations, siteGeoAudits } from '@/db/schema';
import type { SiteGeoAudit } from '@/db/schema';
import { get } from '@/lib/blob';
import { analyzeGeoPages } from './analyze';
import { confirmCandidate } from './confirm';
import type { GeoPageInput } from './types';

type ManifestEntry = { url: string; path: string; blobPath: string | null; status: string };

export async function runGeoAudit(opts: { siteId: number }): Promise<SiteGeoAudit> {
  const db = getDb();
  const [site] = await db.select().from(sites).where(eq(sites.id, opts.siteId));
  if (!site) throw new Error(`site ${opts.siteId} not found`);

  const [gen] = await db
    .select()
    .from(generations)
    .where(and(eq(generations.siteId, opts.siteId), eq(generations.status, 'succeeded')))
    .orderBy(desc(generations.createdAt))
    .limit(1);

  if (!gen || !gen.pagesManifestBlobPath) {
    const [row] = await db
      .insert(siteGeoAudits)
      .values({
        siteId: opts.siteId,
        generationId: gen?.id ?? null,
        status: 'failed',
        errorReason: 'no_generation',
        errorMessage: 'Run a generation with crawled pages first.',
        trigger: 'manual',
      })
      .returning();
    return row;
  }

  const t0 = Date.now();
  const manifestBlob = await get(gen.pagesManifestBlobPath, { access: 'private' });
  const manifest = manifestBlob?.stream
    ? (JSON.parse(await new Response(manifestBlob.stream).text()) as { pages: ManifestEntry[] })
    : { pages: [] };

  const eligible = manifest.pages.filter((p) => p.status === 'ok' && p.blobPath);
  const pages: GeoPageInput[] = [];
  for (const entry of eligible) {
    const blob = await get(entry.blobPath as string, { access: 'private' });
    if (!blob?.stream) continue;
    pages.push({ url: entry.url, path: entry.path, markdown: await new Response(blob.stream).text() });
  }

  const result = await analyzeGeoPages(pages, site.displayName ?? site.name, confirmCandidate);

  const [row] = await db
    .insert(siteGeoAudits)
    .values({
      siteId: opts.siteId,
      generationId: gen.id,
      status: 'succeeded',
      score: result.score,
      tier: result.tier,
      results: JSON.stringify(result),
      llmMsUsed: Date.now() - t0,
      trigger: 'manual',
    })
    .returning();
  return row;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test run.test`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/geo-audit/run.ts src/lib/geo-audit/run.test.ts
git commit -m "feat: add GEO run orchestrator with persistence"
```

---

## Task 7: API routes (POST run, GET latest)

**Files:**
- Create: `src/app/api/sites/[id]/geo-audit/route.ts`
- Create: `src/app/api/sites/[id]/geo-audit/latest/route.ts`
- Test: `src/app/api/sites/[id]/geo-audit/route.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/api/sites/[id]/geo-audit/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users } from '@/db/schema';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/geo-audit/run', () => ({ runGeoAudit: vi.fn() }));

import { getCurrentUser } from '@/lib/auth';
import { runGeoAudit } from '@/lib/geo-audit/run';
import { POST } from './route';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function makeUserAndSite(email: string) {
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'X', email }).returning();
  const [s] = await db.insert(sites).values({
    userId: u.id, name: 'S', rootUrl: 'https://s.test',
    webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_xxxx',
  }).returning();
  return { user: u, site: s };
}

describe('POST /api/sites/[id]/geo-audit', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  it('401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await POST(new Request('http://t', { method: 'POST' }), ctx('00000000-0000-0000-0000-000000000000'));
    expect(res.status).toBe(401);
  });

  it('runs the audit and returns the serialized result', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(runGeoAudit).mockResolvedValue({
      uid: 'geo-1', status: 'succeeded', score: 70, tier: 'good',
      fetchedAt: '2026-06-02T00:00:00Z', llmMsUsed: 1000, errorReason: null, errorMessage: null,
      results: JSON.stringify({ score: 70, tier: 'good', signals: [], metadata: { pagesScanned: 1, candidates: 1, confirmCalls: 1 } }),
    } as never);

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(site.uid));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.audit.id).toBe('geo-1');
    expect(body.audit.score).toBe(70);
    expect(vi.mocked(runGeoAudit)).toHaveBeenCalledWith({ siteId: site.id });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test geo-audit/route.test`
Expected: FAIL — cannot import `./route`.

- [ ] **Step 3: Write the POST route**

Create `src/app/api/sites/[id]/geo-audit/route.ts`:

```ts
import { ZodError } from 'zod';
import { ApiError, apiErrorResponse, assertOwnsSiteByUid, requireUserOrThrow } from '@/lib/auth-guards';
import { parseUid } from '@/lib/uid';
import { runGeoAudit } from '@/lib/geo-audit/run';
import { serializeSiteGeoAudit } from '@/lib/geo-audit/serialize';

export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

async function parseSiteUid(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params;
  try {
    return parseUid(id);
  } catch (e) {
    if (e instanceof ZodError) throw new ApiError(400, 'validation', 'Site id must be a UUID');
    throw e;
  }
}

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const uid = await parseSiteUid(ctx);
    const site = await assertOwnsSiteByUid(uid, user.id);
    const audit = await runGeoAudit({ siteId: site.id });
    return Response.json({ audit: serializeSiteGeoAudit(audit, uid) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

- [ ] **Step 4: Write the GET latest route**

Create `src/app/api/sites/[id]/geo-audit/latest/route.ts`:

```ts
import { ZodError } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { siteGeoAudits } from '@/db/schema';
import { ApiError, apiErrorResponse, assertOwnsSiteByUid, requireUserOrThrow } from '@/lib/auth-guards';
import { parseUid } from '@/lib/uid';
import { serializeSiteGeoAudit } from '@/lib/geo-audit/serialize';

type Ctx = { params: Promise<{ id: string }> };

async function parseSiteUid(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params;
  try {
    return parseUid(id);
  } catch (e) {
    if (e instanceof ZodError) throw new ApiError(400, 'validation', 'Site id must be a UUID');
    throw e;
  }
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const uid = await parseSiteUid(ctx);
    const site = await assertOwnsSiteByUid(uid, user.id);
    const [row] = await getDb()
      .select()
      .from(siteGeoAudits)
      .where(eq(siteGeoAudits.siteId, site.id))
      .orderBy(desc(siteGeoAudits.fetchedAt))
      .limit(1);
    return Response.json({ audit: row ? serializeSiteGeoAudit(row, uid) : null });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test geo-audit/route.test`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/sites/[id]/geo-audit/"
git commit -m "feat: add geo-audit API routes (run + latest)"
```

---

## Task 8: Wire GEO into site-readiness (pillar score, next action, stage status)

**Files:**
- Modify: `src/lib/citation-audit/site-readiness.ts`
- Test: `src/lib/citation-audit/site-readiness.test.ts` (add cases; create if absent)

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/citation-audit/site-readiness.test.ts` (create the file with this content if it does not exist):

```ts
import { describe, it, expect } from 'vitest';
import { sitePillarScores, pickNextAction, stageStatus } from './site-readiness';
import type { AuditLike } from './site-readiness';
import type { SiteGeoAuditResult } from '@/lib/geo-audit/types';

const cleared: AuditLike[] = [
  {
    pageUrl: 'https://acme.test/',
    status: 'succeeded',
    results: {
      checks: [
        { id: 'answer-position', passed: true, score: 100, weight: 15, evidence: [], recommendation: null },
        { id: 'schema-type', passed: true, score: 100, weight: 10, evidence: [], recommendation: null },
      ],
    },
  },
];

const geo = (score: number, signals: SiteGeoAuditResult['signals']): SiteGeoAuditResult => ({
  score, tier: score >= 70 ? 'good' : 'poor', signals,
  metadata: { pagesScanned: 1, candidates: 1, confirmCalls: 1 },
});

describe('GEO integration in site-readiness', () => {
  it('recommendable pillar comes from the GEO audit, not per-page checks', () => {
    const scores = sitePillarScores(cleared, geo(70, []));
    expect(scores.recommendable).toEqual({ score: 70, tier: 'good' });
  });

  it('recommendable is null when no GEO audit was run', () => {
    const scores = sitePillarScores(cleared, null);
    expect(scores.recommendable).toBeNull();
  });

  it('pickNextAction surfaces a failing GEO signal only once Readable+Recognized are clean', () => {
    const g = geo(0, [
      { signal: 'pricing', weight: 40, present: false, artifacts: [], pages: [], recommendation: 'Add pricing.' },
      { signal: 'comparison', weight: 30, present: true, artifacts: [], pages: [], recommendation: null },
      { signal: 'case-study', weight: 30, present: true, artifacts: [], pages: [], recommendation: null },
    ]);
    const next = pickNextAction(cleared, g);
    expect(next?.pillar).toBe('recommendable');
    expect(next?.checkId).toBe('geo:pricing');
    expect(next?.recommendation).toBe('Add pricing.');
  });

  it('pickNextAction prefers an unresolved Readable check over GEO', () => {
    const withGap: AuditLike[] = [
      {
        pageUrl: 'https://acme.test/',
        status: 'succeeded',
        results: {
          checks: [
            { id: 'answer-position', passed: false, score: 0, weight: 15, evidence: [], recommendation: 'Fix answer.' },
          ],
        },
      },
    ];
    const next = pickNextAction(withGap, geo(0, []));
    expect(next?.pillar).toBe('readable');
  });

  it('stageStatus asks for a GEO run when Readable+Recognized are cleared but GEO is null', () => {
    const scores = sitePillarScores(cleared, null);
    expect(stageStatus(scores)).toContain('GEO');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test site-readiness.test`
Expected: FAIL — `sitePillarScores`/`pickNextAction` do not accept a GEO argument yet.

- [ ] **Step 3: Update `site-readiness.ts`**

Edit `src/lib/citation-audit/site-readiness.ts`. Add the import at the top (after the existing imports):

```ts
import type { SiteGeoAuditResult } from '@/lib/geo-audit/types';
```

Replace the `sitePillarScores` function with this signature change (accept the GEO result and override the recommendable pillar):

```ts
/** Site health per pillar. Readable/Recognized = mean of per-page pillar scores;
 *  Recommendable = the site-level GEO audit (null until one is run). */
export function sitePillarScores(
  audits: AuditLike[],
  geo: SiteGeoAuditResult | null = null,
): SitePillarScores {
  const pages = usable(audits);
  const out = { readable: null, recommendable: null, recognized: null } as SitePillarScores;
  for (const pillar of ['readable', 'recognized'] as Pillar[]) {
    const perPage = pages
      .map((p) => scorePillar(p.checks, pillar))
      .filter((s): s is PillarScore => s !== null);
    if (perPage.length === 0) continue;
    const mean = Math.round(perPage.reduce((a, s) => a + s.score, 0) / perPage.length);
    out[pillar] = { score: mean, tier: tierFor(mean) };
  }
  out.recommendable = geo ? { score: geo.score, tier: geo.tier } : null;
  return out;
}
```

Replace `pickNextAction` to accept the GEO result and apply the ladder rule (recommendable surfaces only when no Readable/Recognized gaps remain):

```ts
/**
 * Highest-impact unresolved item. Readable + Recognized per-page checks first
 * (weight desc, index page first, pillar order). Only when those are clean does
 * a failing GEO signal surface — preserving the Readable → Recognized → Recommendable ladder.
 */
export function pickNextAction(
  audits: AuditLike[],
  geo: SiteGeoAuditResult | null = null,
): NextAction | null {
  const candidates: NextAction[] = [];
  for (const { pageUrl, checks } of usable(audits)) {
    for (const c of checks) {
      const pillar = PILLAR_OF[c.id];
      if (pillar !== 'readable' && pillar !== 'recognized') continue;
      if (c.passed) continue;
      candidates.push({ checkId: c.id, pillar, pageUrl, weight: c.weight, recommendation: c.recommendation });
    }
  }
  if (candidates.length > 0) {
    candidates.sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight;
      const ai = isIndex(a.pageUrl) ? 0 : 1;
      const bi = isIndex(b.pageUrl) ? 0 : 1;
      if (ai !== bi) return ai - bi;
      return PILLAR_ORDER[a.pillar] - PILLAR_ORDER[b.pillar];
    });
    return candidates[0];
  }
  if (geo) {
    const failing = geo.signals.filter((s) => !s.present).sort((a, b) => b.weight - a.weight);
    if (failing.length > 0) {
      const f = failing[0];
      return {
        checkId: `geo:${f.signal}`,
        pillar: 'recommendable',
        pageUrl: '',
        weight: f.weight,
        recommendation: f.recommendation,
      };
    }
  }
  return null;
}
```

Replace `stageStatus` to cover all three pillars:

```ts
/** Plain-language stage sentence across all three pillars (spec §3 ladder). */
export function stageStatus(scores: SitePillarScores): string {
  const readable = scores.readable?.score ?? 0;
  const recognized = scores.recognized?.score ?? 0;
  const recommendable = scores.recommendable?.score ?? 0;
  if (scores.readable === null) {
    return 'Run an audit to see how ready your site is for AI search.';
  }
  if (readable < CLEARED) {
    return 'Your pages aren\'t fully readable to AI yet. Start here — clean structure and clear answers come first.';
  }
  if (recognized < CLEARED) {
    return 'Your site is Readable. Next: help AI recognize who you are.';
  }
  if (scores.recommendable === null) {
    return 'Readable and Recognized. Run a GEO analysis to see whether AI has the evidence to recommend you.';
  }
  if (recommendable < CLEARED) {
    return 'You\'re Readable and Recognized. Now give AI the evidence to recommend you — pricing, comparisons, and proof.';
  }
  return 'All three pillars cleared. AI can find you, recognize you, and recommend you.';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test site-readiness.test`
Expected: PASS (all GEO cases plus any pre-existing cases).

- [ ] **Step 5: Verify the OverviewPanel still type-checks against the new signatures**

Run: `pnpm tsc --noEmit 2>&1 | grep -E "overview-panel|site-readiness" | head`
Expected: no output (the optional GEO params keep the old 1-arg calls valid until Task 10 updates them).

- [ ] **Step 6: Commit**

```bash
git add src/lib/citation-audit/site-readiness.ts src/lib/citation-audit/site-readiness.test.ts
git commit -m "feat: source Recommendable pillar from GEO audit with ladder-aware next action"
```

---

## Task 9: Recommendable panel component

**Files:**
- Create: `src/components/generations/recommendable-panel.tsx`
- Test: `src/components/generations/recommendable-panel.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/generations/recommendable-panel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecommendablePanel } from './recommendable-panel';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('RecommendablePanel', () => {
  it('shows the empty state with a run button when no audit exists', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ audit: null }) });
    wrap(<RecommendablePanel siteId="site-1" />);
    expect(await screen.findByRole('button', { name: /run geo analysis/i })).toBeInTheDocument();
  });

  it('renders confirmed signals with artifacts from the latest audit', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        audit: {
          id: 'geo-1', status: 'succeeded', score: 70, tier: 'good', fetchedAt: new Date().toISOString(),
          results: {
            score: 70, tier: 'good', metadata: { pagesScanned: 3, candidates: 2, confirmCalls: 2 },
            signals: [
              { signal: 'pricing', weight: 40, present: true, artifacts: ['from $29/mo'], pages: ['https://acme.test/pricing'], recommendation: null },
              { signal: 'comparison', weight: 30, present: false, artifacts: [], pages: [], recommendation: 'Add a comparison page.' },
              { signal: 'case-study', weight: 30, present: true, artifacts: ['40% faster onboarding'], pages: ['https://acme.test/x'], recommendation: null },
            ],
          },
        },
      }),
    });
    wrap(<RecommendablePanel siteId="site-1" />);
    expect(await screen.findByText('from $29/mo')).toBeInTheDocument();
    expect(screen.getByText('40% faster onboarding')).toBeInTheDocument();
    expect(screen.getByText('Add a comparison page.')).toBeInTheDocument();
    expect(screen.getByText('70')).toBeInTheDocument();
  });

  it('runs an audit when the run button is clicked', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ audit: null }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ audit: { id: 'geo-2', status: 'succeeded', score: 0, tier: 'poor', fetchedAt: new Date().toISOString(), results: { score: 0, tier: 'poor', metadata: { pagesScanned: 0, candidates: 0, confirmCalls: 0 }, signals: [] } } }) });
    wrap(<RecommendablePanel siteId="site-1" />);
    const btn = await screen.findByRole('button', { name: /run geo analysis/i });
    await userEvent.click(btn);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/sites/site-1/geo-audit', { method: 'POST' });
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test recommendable-panel.test`
Expected: FAIL — cannot import `RecommendablePanel`.

- [ ] **Step 3: Write the component**

Create `src/components/generations/recommendable-panel.tsx`:

```tsx
'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X, RefreshCw, Sparkles } from 'lucide-react';
import { TabPanel } from '@/components/layout/tab-panel';
import { formatRelativeTime } from '@/lib/format-time';
import type { SerializedSiteGeoAudit } from '@/lib/geo-audit/serialize';

const SIGNAL_LABEL: Record<string, string> = {
  pricing: 'Public pricing page',
  comparison: 'Competitor comparison',
  'case-study': 'Case study with a metric',
};

function scoreColor(score: number): string {
  if (score >= 70) return 'text-semantic-success';
  if (score >= 50) return 'text-primary-base';
  return 'text-destructive';
}

export function RecommendablePanel({ siteId }: { siteId: string }) {
  const queryClient = useQueryClient();

  const latest = useQuery({
    queryKey: ['geo-audit', 'latest', siteId],
    queryFn: async (): Promise<{ audit: SerializedSiteGeoAudit | null }> => {
      const res = await fetch(`/api/sites/${siteId}/geo-audit/latest`);
      if (!res.ok) throw new Error('Failed to load GEO analysis');
      return res.json();
    },
  });

  const run = useMutation({
    mutationFn: async (): Promise<SerializedSiteGeoAudit> => {
      const res = await fetch(`/api/sites/${siteId}/geo-audit`, { method: 'POST' });
      if (!res.ok) throw new Error('GEO analysis failed');
      const body = (await res.json()) as { audit: SerializedSiteGeoAudit };
      return body.audit;
    },
    onSuccess: (audit) => {
      queryClient.setQueryData(['geo-audit', 'latest', siteId], { audit });
    },
  });

  if (latest.isPending) {
    return (
      <TabPanel flat>
        <p className="text-center text-body py-8">Loading…</p>
      </TabPanel>
    );
  }

  const audit = latest.data?.audit ?? null;
  const result = audit?.status === 'succeeded' ? audit.results : null;
  const running = run.isPending;

  // Empty / not-yet-run state
  if (!result) {
    return (
      <TabPanel flat>
        <div className="flex flex-col items-center text-center gap-4 py-12">
          <Sparkles className="h-8 w-8 text-muted-soft" aria-hidden="true" />
          <div>
            <p className="text-lg text-ink mb-1">See if AI has the evidence to recommend you</p>
            <p className="text-sm text-body max-w-md">
              We scan your crawled pages for public pricing, competitor comparisons, and case
              studies with real numbers — the proof AI needs to put you on a shortlist.
            </p>
          </div>
          <button
            onClick={() => run.mutate()}
            disabled={running}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer"
          >
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {running ? 'Analyzing… ~15s' : 'Run GEO analysis'}
          </button>
          {run.isError && <p className="text-sm text-destructive">Analysis failed. Try again.</p>}
          {audit?.status === 'failed' && (
            <p className="text-sm text-muted-soft">{audit.errorMessage}</p>
          )}
        </div>
      </TabPanel>
    );
  }

  return (
    <TabPanel
      flat
      meta={
        <div>
          <p className={`text-2xl font-semibold ${scoreColor(result.score)}`}>
            {result.score}
            <span className="ml-1 text-sm font-normal text-muted-soft capitalize">{result.tier}</span>
          </p>
          <p className="text-xs text-muted-soft mt-0.5">
            Last analyzed {formatRelativeTime(audit!.fetchedAt)}
          </p>
        </div>
      }
      actions={
        <button
          onClick={() => run.mutate()}
          disabled={running}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-hairline rounded-md bg-canvas hover:bg-canvas-soft transition-colors text-ink disabled:opacity-60 cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${running ? 'animate-spin' : ''}`} aria-hidden="true" />
          {running ? 'Analyzing…' : 'Re-run analysis'}
        </button>
      }
    >
      <ul className="divide-y divide-hairline">
        {result.signals.map((s) => (
          <li key={s.signal} className="flex gap-3 py-4">
            <span
              className={`flex-shrink-0 mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full ${
                s.present ? 'bg-semantic-success/10 text-semantic-success' : 'bg-canvas-soft text-muted-soft'
              }`}
            >
              {s.present ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-medium text-ink">{SIGNAL_LABEL[s.signal] ?? s.signal}</p>
                <span className="text-xs text-muted-soft">{s.weight} pts</span>
              </div>
              {s.present && s.artifacts.length > 0 && (
                <p className="mt-1 text-sm text-body">{s.artifacts.join(' · ')}</p>
              )}
              {s.present && s.pages.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                  {s.pages.map((url) => (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-muted-strong underline decoration-hairline-strong underline-offset-2 hover:text-ink"
                    >
                      {(() => {
                        try {
                          return new URL(url).pathname;
                        } catch {
                          return url;
                        }
                      })()}
                    </a>
                  ))}
                </div>
              )}
              {!s.present && s.recommendation && (
                <p className="mt-1 text-sm text-body border-l-2 border-hairline-strong pl-3">
                  {s.recommendation}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-muted-soft">
        Scanned {result.metadata.pagesScanned} pages, confirmed {result.metadata.confirmCalls} candidates with a model.
      </p>
    </TabPanel>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test recommendable-panel.test`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/generations/recommendable-panel.tsx src/components/generations/recommendable-panel.test.tsx
git commit -m "feat: add Recommendable panel component"
```

---

## Task 10: Wire the panel into the tab shell and make the Overview card live

**Files:**
- Modify: `src/app/(app)/sites/[id]/site-detail-client.tsx`
- Modify: `src/components/generations/overview-panel.tsx`
- Test: `src/components/generations/overview-panel.test.tsx` (add a case; create if absent)

- [ ] **Step 1: Swap the Recommendable tab content**

In `src/app/(app)/sites/[id]/site-detail-client.tsx`:

Add the import near the other panel imports (after the `ReadablePanel` import line):

```ts
import { RecommendablePanel } from '@/components/generations/recommendable-panel';
```

Replace the Recommendable `TabsContent` block (currently rendering `ComingSoonPanel`):

```tsx
              <TabsContent value="recommendable" className="mt-0 outline-none">
                <RecommendablePanel siteId={site.uid} />
              </TabsContent>
```

If `ComingSoonPanel` is no longer referenced anywhere in the file after this change, remove its now-unused import line:

```ts
import { ComingSoonPanel } from '@/components/generations/coming-soon-panel';
```

Run: `pnpm tsc --noEmit 2>&1 | grep -E "coming-soon|ComingSoonPanel" | head` — expected: no output (confirms it is fully unreferenced; leave the file `coming-soon-panel.tsx` in place since other tabs may use it — check first with `grep -rn "ComingSoonPanel" src` and only remove the import if zero other usages in this file).

- [ ] **Step 2: Write the failing Overview test**

Append to `src/components/generations/overview-panel.test.tsx` (create with this scaffold if absent):

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OverviewPanel } from './overview-panel';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

describe('OverviewPanel GEO card', () => {
  it('renders the live Recommendable score from the GEO audit', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url.includes('citation-audits/latest')) {
        return Promise.resolve({ ok: true, json: async () => ({ audits: [] }) });
      }
      if (url.includes('geo-audit/latest')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ audit: { status: 'succeeded', score: 70, tier: 'good', results: { score: 70, tier: 'good', signals: [], metadata: { pagesScanned: 1, candidates: 0, confirmCalls: 0 } } } }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    wrap(<OverviewPanel siteId="site-1" onNavigate={() => {}} />);
    // The Recommendable card shows the live score instead of "Coming soon".
    expect(await screen.findByText('70')).toBeInTheDocument();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test overview-panel.test`
Expected: FAIL — the card still renders the static "Coming soon" text and never fetches the GEO audit.

- [ ] **Step 4: Update the OverviewPanel**

In `src/components/generations/overview-panel.tsx`:

Add the GEO result type import (after the existing `Tier` import):

```ts
import type { SiteGeoAuditResult } from '@/lib/geo-audit/types';
```

Add GEO next-action labels to the `CHECK_LABEL` record (append these three entries inside the object):

```ts
  'geo:pricing': 'Add a public pricing page',
  'geo:comparison': 'Add a competitor comparison page',
  'geo:case-study': 'Add a case study with a real metric',
```

Add a second query for the GEO audit, right after the existing `latest` query:

```ts
  const geo = useQuery({
    queryKey: ['geo-audit', 'latest', siteId],
    queryFn: async (): Promise<{ audit: { status: string; results: SiteGeoAuditResult | null } | null }> => {
      const res = await fetch(`/api/sites/${siteId}/geo-audit/latest`);
      if (!res.ok) throw new Error('Failed to load GEO analysis');
      return res.json();
    },
  });
```

Update the pending guard so it waits for both queries:

```ts
  if (latest.isPending || geo.isPending) {
```

Derive the GEO result and pass it through. Replace the three derivation lines:

```ts
  const audits = latest.data?.audits ?? [];
  const geoResult =
    geo.data?.audit?.status === 'succeeded' ? (geo.data.audit.results ?? null) : null;
  const scores = sitePillarScores(audits, geoResult);
  const next = pickNextAction(audits, geoResult);
  const status = stageStatus(scores);
```

Replace the static Recommendable `<div>` (the one containing "Coming soon") with a live `PillarCard`:

```tsx
        <PillarCard
          title="Recommendable"
          subtitle="Will AI pick you when asked to choose?"
          score={scores.recommendable}
          onClick={() => onNavigate('recommendable')}
        />
```

(Note: `PillarCard` already renders "— Run an audit" when `score` is null; that reads correctly as the not-yet-analyzed state for Recommendable.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test overview-panel.test`
Expected: PASS.

- [ ] **Step 6: Full verification**

Run: `pnpm test` — expected: all suites pass.
Run: `pnpm tsc --noEmit` — expected: no errors.
Run: `pnpm build` — expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/sites/[id]/site-detail-client.tsx" src/components/generations/overview-panel.tsx src/components/generations/overview-panel.test.tsx
git commit -m "feat: wire Recommendable panel and live Overview GEO card"
```

---

## Final verification (after all tasks)

- [ ] Run `pnpm test` — all green.
- [ ] Run `pnpm tsc --noEmit` — clean.
- [ ] Run `pnpm build` — succeeds.
- [ ] Manual smoke (dev server on :4242): open a site → Recommendable tab → "Run GEO analysis" → signals render with artifacts; Overview Recommendable card shows the score; stage sentence updates.
