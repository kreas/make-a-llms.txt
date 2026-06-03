# Recommendable v2 — Engine Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the v1 GEO audit with a site-aware engine — a signal registry + site-type profiles + normalized goal-weighted scoring, site-type classification, and an async Cloudflare `/crawl` job orchestrated by a Vercel Workflow — exposed through classify/run/poll APIs.

**Architecture:** Refactor the existing `src/lib/geo-audit/` modules (don't discard). Each signal becomes a self-contained `GeoSignalDef` registered in `SIGNAL_REGISTRY`; site types are data-only profiles referencing signal ids; goals boost weights by tag; scoring normalizes to 0–100 over the active set. The synchronous run becomes a WDK workflow (`'use workflow'`/`'use step'`) that crawls via Cloudflare Browser Rendering `/crawl`, confirms candidates with an LLM, scores, and persists — updating a status/stage on the audit row that the UI polls.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM (libsql/SQLite), Vercel AI SDK (`generateText`+`Output.object`) via AI Gateway (`google/gemini-3.1-flash-lite`), Cloudflare Browser Rendering `/crawl`, Workflow DevKit (`workflow/api`), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-02-recommendable-v2-tailored-geo-design.md`

**Plan 2 (Experience — UI + charts) is a separate document and depends on this plan's API.**

---

## File Structure

**Refactored (existing `src/lib/geo-audit/`):**
- `types.ts` — add `SiteType`, `Goal`, `SignalTag`, `GeoSignalDef`; extend `GeoSignalResult` (+`label`,+`tags`) and `SiteGeoAuditResult` (+`siteType`,+`goal`).
- `score.ts` — normalized, goal-weighted scoring over an active set.
- `confirm.ts` — generic confirm driven by a signal's `confirmPrompt`.
- `analyze.ts` — gate+confirm+score over crawled records for a resolved active set.
- `serialize.ts` — surface new row columns.

**New (`src/lib/geo-audit/`):**
- `signals/index.ts` — `SIGNAL_REGISTRY` + `getSignal()`.
- `signals/social-proof.ts`, `signals/differentiation.ts` — universal core.
- `signals/pricing.ts`, `signals/comparison.ts`, `signals/case-study.ts` — migrated SaaS.
- `signals/author-credibility.ts`, `signals/cited-sources.ts`, `signals/original-data.ts` — publisher.
- `profiles.ts` — `PROFILES`, `UNIVERSAL_CORE`, `activeSignalIds()`, `GOAL_BOOSTS`.
- `classify.ts` — `classifySite()` (histogram + description → LLM).
- `crawl.ts` — `startCrawl()` / `pollCrawl()` Cloudflare client.
- `enqueue.ts` — `enqueueGeoAudit()` (creates row, starts workflow).

**New (`src/lib/workflow/`):**
- `geo-audit-workflow.ts` — `runGeoAuditWorkflow` (`'use workflow'`) + steps.

**New API (`src/app/api/sites/[id]/geo-audit/`):**
- `classify/route.ts` — POST discovery.
- `route.ts` — POST run (rewritten to enqueue the workflow); GET latest (status-aware, mostly unchanged).

**Modified:** `src/db/schema.ts` (sites + site_geo_audits columns), `drizzle/` (migration).

**Removed:** `src/lib/geo-audit/gates.ts` and `src/lib/geo-audit/run.ts` (their logic moves into signal modules and the workflow, respectively). Their tests are replaced.

---

## Task 1: v2 type foundations + universal core signals

**Files:**
- Modify: `src/lib/geo-audit/types.ts`
- Create: `src/lib/geo-audit/signals/social-proof.ts`
- Create: `src/lib/geo-audit/signals/differentiation.ts`
- Create: `src/lib/geo-audit/signals/index.ts`
- Test: `src/lib/geo-audit/signals/registry.test.ts`

- [ ] **Step 1: Extend the types.** Replace the contents of `src/lib/geo-audit/types.ts` with:

```ts
import type { Tier } from '@/lib/citation-audit/types';

export type SiteType = 'saas' | 'ecommerce' | 'local' | 'publisher' | 'services' | 'other';
export type Goal = 'get-cited' | 'win-comparisons' | 'build-trust';
export type SignalTag = 'proof' | 'comparison' | 'evidence' | 'trust' | 'value';

export type GeoPageInput = {
  url: string;
  path: string;
  markdown: string;
};

/** A heuristic gate firing: this page is a candidate for one signal. */
export type GateMatch = {
  signalId: string;
  url: string;
  path: string;
  reason: string;
};

/** LLM confirm output for one candidate page. */
export type GeoConfirm = {
  confirmed: boolean;
  artifact: string | null;
};

/** A self-contained, registered signal definition. */
export type GeoSignalDef = {
  id: string;
  label: string;
  tags: SignalTag[];
  defaultWeight: number;
  /** URL globs handed to the crawl's includePatterns, e.g. ['**\/pricing**']. */
  urlPatterns: string[];
  /** Cheap per-page heuristic over crawled markdown → candidate or null. */
  gate: (page: GeoPageInput) => GateMatch | null;
  /** LLM confirm system prompt for this signal. */
  confirmPrompt: (entityName: string) => string;
  /** Shown when the signal is absent. */
  recommendation: string;
};

export type GeoConfirmFn = (
  signalId: string,
  page: GeoPageInput,
  entityName: string,
) => Promise<GeoConfirm>;

/** Per-signal verdict after gating + confirming. */
export type GeoSignalResult = {
  signal: string;          // signal id
  label: string;
  tags: SignalTag[];
  weight: number;          // effective (goal-adjusted) weight used in scoring
  present: boolean;
  artifacts: string[];
  pages: string[];
  recommendation: string | null;
};

export type SiteGeoAuditResult = {
  siteType: SiteType;
  goal: Goal;
  score: number;
  tier: Tier;
  signals: GeoSignalResult[];
  metadata: { pagesScanned: number; candidates: number; confirmCalls: number };
};
```

- [ ] **Step 2: Write the failing registry test.** Create `src/lib/geo-audit/signals/registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SIGNAL_REGISTRY, getSignal } from './index';

describe('signal registry', () => {
  it('registers the universal core signals', () => {
    expect(getSignal('social-proof')?.id).toBe('social-proof');
    expect(getSignal('differentiation')?.id).toBe('differentiation');
  });

  it('every registered signal has the required shape', () => {
    for (const [id, def] of Object.entries(SIGNAL_REGISTRY)) {
      expect(def.id).toBe(id);
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.tags.length).toBeGreaterThan(0);
      expect(def.defaultWeight).toBeGreaterThan(0);
      expect(Array.isArray(def.urlPatterns)).toBe(true);
      expect(typeof def.gate).toBe('function');
      expect(typeof def.confirmPrompt).toBe('function');
      expect(def.recommendation.length).toBeGreaterThan(0);
    }
  });

  it('social-proof gate fires on testimonial/review language', () => {
    const sig = getSignal('social-proof')!;
    expect(sig.gate({ url: 'https://x.test/', path: 'index', markdown: 'See our 5-star reviews and testimonials.' })).not.toBeNull();
    expect(sig.gate({ url: 'https://x.test/', path: 'index', markdown: 'A quiet page.' })).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails.** Run: `pnpm test geo-audit/signals/registry.test` — Expected: FAIL (cannot import `./index`).

- [ ] **Step 4: Write the core signal modules.** Create `src/lib/geo-audit/signals/social-proof.ts`:

```ts
import type { GeoSignalDef } from '../types';

const RX = /\b(testimonial|reviews?|rated|rating|★|⭐|trusted by|customers? love|case stud|endorse|G2|Trustpilot|five[- ]star|5[- ]star)\b/i;

export const socialProof: GeoSignalDef = {
  id: 'social-proof',
  label: 'Social proof',
  tags: ['proof', 'trust'],
  defaultWeight: 20,
  urlPatterns: ['**/', '**/reviews**', '**/testimonials**', '**/customers**'],
  gate: (p) =>
    RX.test(p.markdown)
      ? { signalId: 'social-proof', url: p.url, path: p.path, reason: 'Mentions reviews/testimonials/endorsements' }
      : null,
  confirmPrompt: (e) =>
    `You audit whether a web page shows genuine third-party SOCIAL PROOF for ${e} — real testimonials, named customer quotes, review counts, or star ratings. Set confirmed=true only if such proof is present (not a generic "trusted by" with no detail). If confirmed, set artifact to a short summary like "12 G2 reviews · 3 named testimonials"; otherwise artifact=null. Reply only via the structured output.`,
  recommendation: 'Add real testimonials, named customer quotes, or review counts. AI leans on third-party proof when deciding whom to recommend.',
};
```

Create `src/lib/geo-audit/signals/differentiation.ts`:

```ts
import type { GeoSignalDef } from '../types';

const RX = /\b(why choose|why us|what makes us|unlike|the only|different from|vs\.?|compared to|our approach|what sets us apart)\b/i;

export const differentiation: GeoSignalDef = {
  id: 'differentiation',
  label: 'Differentiation',
  tags: ['value'],
  defaultWeight: 15,
  urlPatterns: ['**/', '**/about**', '**/why**'],
  gate: (p) =>
    RX.test(p.markdown)
      ? { signalId: 'differentiation', url: p.url, path: p.path, reason: 'Contains positioning / "why us" language' }
      : null,
  confirmPrompt: (e) =>
    `You audit whether a web page states a clear DIFFERENTIATION for ${e} — a concrete "why choose us" / what-makes-us-different positioning (not vague marketing). Set confirmed=true only if there is a specific stance a buyer could repeat. If confirmed, set artifact to a one-line paraphrase of the differentiator; otherwise artifact=null. Reply only via the structured output.`,
  recommendation: 'State a clear, concrete "why us" — the specific thing that sets you apart. AI needs a repeatable reason to pick you over alternatives.',
};
```

Create `src/lib/geo-audit/signals/index.ts`:

```ts
import type { GeoSignalDef } from '../types';
import { socialProof } from './social-proof';
import { differentiation } from './differentiation';

const ALL: GeoSignalDef[] = [socialProof, differentiation];

export const SIGNAL_REGISTRY: Record<string, GeoSignalDef> = Object.fromEntries(
  ALL.map((s) => [s.id, s]),
);

export function getSignal(id: string): GeoSignalDef | undefined {
  return SIGNAL_REGISTRY[id];
}
```

- [ ] **Step 5: Run the test to verify it passes.** Run: `pnpm test geo-audit/signals/registry.test` — Expected: PASS (3 tests).

- [ ] **Step 6: Commit.**

```bash
git add src/lib/geo-audit/types.ts src/lib/geo-audit/signals/social-proof.ts src/lib/geo-audit/signals/differentiation.ts src/lib/geo-audit/signals/index.ts src/lib/geo-audit/signals/registry.test.ts
git commit -m "feat: add GEO signal registry and universal core signals"
```

---

## Task 2: Migrate SaaS signals into the registry

**Files:**
- Create: `src/lib/geo-audit/signals/pricing.ts`, `comparison.ts`, `case-study.ts`
- Modify: `src/lib/geo-audit/signals/index.ts` (register them)
- Delete: `src/lib/geo-audit/gates.ts`, `src/lib/geo-audit/gates.test.ts`
- Test: `src/lib/geo-audit/signals/saas-signals.test.ts`

- [ ] **Step 1: Write the failing test.** Create `src/lib/geo-audit/signals/saas-signals.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getSignal } from './index';
import type { GeoPageInput } from '../types';

const page = (over: Partial<GeoPageInput>): GeoPageInput => ({ url: 'https://acme.test/', path: 'index', markdown: '', ...over });

describe('SaaS signals', () => {
  it('pricing gates by URL and by price+plan keywords', () => {
    const s = getSignal('pricing')!;
    expect(s.gate(page({ url: 'https://acme.test/pricing' }))).not.toBeNull();
    expect(s.gate(page({ markdown: 'Plans start at $29/mo.' }))).not.toBeNull();
    expect(s.gate(page({ markdown: 'We donated $5.' }))).toBeNull();
    expect(s.urlPatterns).toContain('**/pricing**');
  });

  it('comparison gates by URL and "X vs Y"', () => {
    const s = getSignal('comparison')!;
    expect(s.gate(page({ url: 'https://acme.test/compare/acme-vs-beta' }))).not.toBeNull();
    expect(s.gate(page({ markdown: '## Acme vs Beta' }))).not.toBeNull();
  });

  it('case-study gates by URL and metric+testimonial', () => {
    const s = getSignal('case-study')!;
    expect(s.gate(page({ url: 'https://acme.test/customers/x' }))).not.toBeNull();
    expect(s.gate(page({ markdown: 'Northwind achieved 40% faster onboarding.' }))).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.** Run: `pnpm test saas-signals.test` — Expected: FAIL (signals not registered).

- [ ] **Step 3: Write the SaaS signal modules.** Create `src/lib/geo-audit/signals/pricing.ts`:

```ts
import type { GeoSignalDef } from '../types';

const URL_RX = /\/(pricing|plans|pricing-plans)(\/|$|\?)/i;
const CURRENCY = /[$€£]\s?\d/;
const PLAN_RX = /(per month|\/mo\b|\/month|per year|\/yr\b|starting at|starts at|free tier|free plan|billed annually|per seat)/i;

export const pricing: GeoSignalDef = {
  id: 'pricing',
  label: 'Public pricing page',
  tags: ['value'],
  defaultWeight: 40,
  urlPatterns: ['**/pricing**', '**/plans**'],
  gate: (p) => {
    if (URL_RX.test(p.url)) return { signalId: 'pricing', url: p.url, path: p.path, reason: 'URL looks like a pricing page' };
    if (CURRENCY.test(p.markdown) && PLAN_RX.test(p.markdown)) return { signalId: 'pricing', url: p.url, path: p.path, reason: 'Page shows prices with plan terms' };
    return null;
  },
  confirmPrompt: (e) =>
    `You audit whether a web page is a genuine PUBLIC PRICING page for ${e}. Set confirmed=true only if it shows at least one visible price or named plan/tier. If confirmed, set artifact to a short price hint like "from $29/mo · 3 tiers"; otherwise artifact=null. Reply only via the structured output.`,
  recommendation: 'Publish a public pricing or plans page. AI cannot recommend you on value if it cannot see what you cost.',
};
```

Create `src/lib/geo-audit/signals/comparison.ts`:

```ts
import type { GeoSignalDef } from '../types';

const URL_RX = /\/(vs|compare|comparison|alternatives?|alternative-to)(\/|$|\?)/i;
const TEXT_RX = /\b[\w][\w .&-]{1,30}\s+vs\.?\s+[\w][\w .&-]{1,30}\b|\balternatives?\s+to\b/i;

export const comparison: GeoSignalDef = {
  id: 'comparison',
  label: 'Competitor comparison',
  tags: ['comparison'],
  defaultWeight: 30,
  urlPatterns: ['**/vs/**', '**/compare**', '**/comparison**', '**/alternatives**'],
  gate: (p) => {
    if (URL_RX.test(p.url)) return { signalId: 'comparison', url: p.url, path: p.path, reason: 'URL looks like a comparison page' };
    if (TEXT_RX.test(p.markdown)) return { signalId: 'comparison', url: p.url, path: p.path, reason: 'Text compares against another named option' };
    return null;
  },
  confirmPrompt: (e) =>
    `You audit whether a web page directly compares ${e} against a specifically named competitor. Set confirmed=true only if at least one named competitor is compared head to head. If confirmed, set artifact to the competitor name(s), comma separated; otherwise artifact=null. Reply only via the structured output.`,
  recommendation: 'Publish a "You vs [competitor]" or "alternatives to" page so AI has a sourced answer when buyers compare named rivals.',
};
```

Create `src/lib/geo-audit/signals/case-study.ts`:

```ts
import type { GeoSignalDef } from '../types';

const URL_RX = /\/(case-stud(y|ies)|customers?|success-stor(y|ies)|customer-stor(y|ies))(\/|$|\?)/i;
const METRIC = /\b\d+(\.\d+)?\s?(%|x|×)(?=\s|$)|[$€£]\s?\d[\d,]*\b|\b\d+\s?(hours?|days?|weeks?|months?|minutes?)\b/i;
const TESTIMONIAL = /\b(results?|achieved|increased|reduced|decreased|improved|grew|saved|boosted|cut|faster|roi|conversion)\b/i;

export const caseStudy: GeoSignalDef = {
  id: 'case-study',
  label: 'Case study with a metric',
  tags: ['evidence', 'proof'],
  defaultWeight: 30,
  urlPatterns: ['**/case-stud**', '**/customers**', '**/success**'],
  gate: (p) => {
    if (URL_RX.test(p.url)) return { signalId: 'case-study', url: p.url, path: p.path, reason: 'URL looks like a case study' };
    if (METRIC.test(p.markdown) && TESTIMONIAL.test(p.markdown)) return { signalId: 'case-study', url: p.url, path: p.path, reason: 'Page contains an outcome metric' };
    return null;
  },
  confirmPrompt: (e) =>
    `You audit whether a web page is a genuine customer CASE STUDY for ${e} containing a concrete outcome metric (a real number: %, multiple, time, or money). Set confirmed=true only if such a metric is present. If confirmed, set artifact to the headline metric like "40% faster onboarding"; otherwise artifact=null. Reply only via the structured output.`,
  recommendation: 'Publish a customer case study with a concrete outcome metric (a real %, multiple, time saved, or dollar figure).',
};
```

- [ ] **Step 4: Register them and delete the old gates file.** Update `src/lib/geo-audit/signals/index.ts` imports + ALL array:

```ts
import type { GeoSignalDef } from '../types';
import { socialProof } from './social-proof';
import { differentiation } from './differentiation';
import { pricing } from './pricing';
import { comparison } from './comparison';
import { caseStudy } from './case-study';

const ALL: GeoSignalDef[] = [socialProof, differentiation, pricing, comparison, caseStudy];

export const SIGNAL_REGISTRY: Record<string, GeoSignalDef> = Object.fromEntries(
  ALL.map((s) => [s.id, s]),
);

export function getSignal(id: string): GeoSignalDef | undefined {
  return SIGNAL_REGISTRY[id];
}
```

Then remove the now-obsolete v1 gate files:

```bash
git rm src/lib/geo-audit/gates.ts src/lib/geo-audit/gates.test.ts
```

- [ ] **Step 5: Run the test to verify it passes.** Run: `pnpm test saas-signals.test` — Expected: PASS (3 tests).

- [ ] **Step 6: Commit.**

```bash
git add src/lib/geo-audit/signals/pricing.ts src/lib/geo-audit/signals/comparison.ts src/lib/geo-audit/signals/case-study.ts src/lib/geo-audit/signals/index.ts src/lib/geo-audit/signals/saas-signals.test.ts
git commit -m "feat: migrate SaaS GEO signals into the registry, remove v1 gates"
```

---

## Task 3: Publisher signals

**Files:**
- Create: `src/lib/geo-audit/signals/author-credibility.ts`, `cited-sources.ts`, `original-data.ts`
- Modify: `src/lib/geo-audit/signals/index.ts`
- Test: `src/lib/geo-audit/signals/publisher-signals.test.ts`

- [ ] **Step 1: Write the failing test.** Create `src/lib/geo-audit/signals/publisher-signals.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getSignal } from './index';
import type { GeoPageInput } from '../types';

const page = (over: Partial<GeoPageInput>): GeoPageInput => ({ url: 'https://blog.test/post', path: 'post', markdown: '', ...over });

describe('Publisher signals', () => {
  it('author-credibility gates on bylines/author bios', () => {
    const s = getSignal('author-credibility')!;
    expect(s.gate(page({ markdown: 'By Jane Doe, Senior Editor. About the author: …' }))).not.toBeNull();
    expect(s.gate(page({ markdown: 'A post with no author.' }))).toBeNull();
  });

  it('cited-sources gates on references/citations', () => {
    const s = getSignal('cited-sources')!;
    expect(s.gate(page({ markdown: 'According to a study [1]. References: https://example.com/source' }))).not.toBeNull();
  });

  it('original-data gates on first-party data language', () => {
    const s = getSignal('original-data')!;
    expect(s.gate(page({ markdown: 'Our survey of 1,200 users found that 63% …' }))).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.** Run: `pnpm test publisher-signals.test` — Expected: FAIL.

- [ ] **Step 3: Write the publisher signal modules.** Create `src/lib/geo-audit/signals/author-credibility.ts`:

```ts
import type { GeoSignalDef } from '../types';

const RX = /\b(by [A-Z][a-z]+ [A-Z][a-z]+|about the author|author bio|written by|edited by|reviewed by|, (senior |staff |contributing )?(editor|writer|journalist|reporter|md|phd))\b/i;

export const authorCredibility: GeoSignalDef = {
  id: 'author-credibility',
  label: 'Author credibility',
  tags: ['trust'],
  defaultWeight: 25,
  urlPatterns: ['**/', '**/blog/**', '**/articles/**', '**/author/**'],
  gate: (p) =>
    RX.test(p.markdown)
      ? { signalId: 'author-credibility', url: p.url, path: p.path, reason: 'Has bylines / author bio' }
      : null,
  confirmPrompt: (e) =>
    `You audit whether ${e}'s content shows real AUTHOR CREDIBILITY — named authors with bylines and bios/credentials (E-E-A-T), not anonymous posts. Set confirmed=true only if a named author with some credential or bio is present. If confirmed, set artifact like "bylines + bios (e.g. Jane Doe, Editor)"; otherwise artifact=null. Reply only via the structured output.`,
  recommendation: 'Add named author bylines with short bios/credentials. AI weighs author expertise (E-E-A-T) when citing content.',
};
```

Create `src/lib/geo-audit/signals/cited-sources.ts`:

```ts
import type { GeoSignalDef } from '../types';

const RX = /\b(according to|source:|sources:|references?:|cited|\[\d+\]|study (found|showed)|research (from|by))\b/i;
const OUTBOUND = /\]\(https?:\/\//;

export const citedSources: GeoSignalDef = {
  id: 'cited-sources',
  label: 'Cited sources',
  tags: ['evidence'],
  defaultWeight: 15,
  urlPatterns: ['**/', '**/blog/**', '**/articles/**'],
  gate: (p) =>
    RX.test(p.markdown) || OUTBOUND.test(p.markdown)
      ? { signalId: 'cited-sources', url: p.url, path: p.path, reason: 'References or outbound citations present' }
      : null,
  confirmPrompt: (e) =>
    `You audit whether ${e}'s content CITES SOURCES — references primary sources, studies, or data with attribution/links. Set confirmed=true only if there is real sourcing, not just internal links. If confirmed, set artifact like "cites 3 external studies"; otherwise artifact=null. Reply only via the structured output.`,
  recommendation: 'Cite primary sources and link to them. Sourced content is far more likely to be quoted by AI.',
};
```

Create `src/lib/geo-audit/signals/original-data.ts`:

```ts
import type { GeoSignalDef } from '../types';

const RX = /\b(our (survey|study|research|analysis|data|report)|we (surveyed|analyzed|studied|measured)|original (research|data)|first-party data|we found that|\d{2,}% of (respondents|users|customers))\b/i;

export const originalData: GeoSignalDef = {
  id: 'original-data',
  label: 'Original data or research',
  tags: ['evidence'],
  defaultWeight: 30,
  urlPatterns: ['**/', '**/blog/**', '**/research/**', '**/reports/**'],
  gate: (p) =>
    RX.test(p.markdown)
      ? { signalId: 'original-data', url: p.url, path: p.path, reason: 'First-party data / research language' }
      : null,
  confirmPrompt: (e) =>
    `You audit whether ${e} publishes ORIGINAL DATA or research — a first-party survey, study, dataset, or analysis (not just citing others). Set confirmed=true only if the data appears to be their own. If confirmed, set artifact like "survey of 1,200 users"; otherwise artifact=null. Reply only via the structured output.`,
  recommendation: 'Publish original research or data (a survey, benchmark, or analysis). First-party data is a top citation magnet for AI.',
};
```

- [ ] **Step 4: Register them.** Update `src/lib/geo-audit/signals/index.ts` to import and include the three publisher signals in `ALL`:

```ts
import type { GeoSignalDef } from '../types';
import { socialProof } from './social-proof';
import { differentiation } from './differentiation';
import { pricing } from './pricing';
import { comparison } from './comparison';
import { caseStudy } from './case-study';
import { authorCredibility } from './author-credibility';
import { citedSources } from './cited-sources';
import { originalData } from './original-data';

const ALL: GeoSignalDef[] = [
  socialProof, differentiation,
  pricing, comparison, caseStudy,
  authorCredibility, citedSources, originalData,
];

export const SIGNAL_REGISTRY: Record<string, GeoSignalDef> = Object.fromEntries(
  ALL.map((s) => [s.id, s]),
);

export function getSignal(id: string): GeoSignalDef | undefined {
  return SIGNAL_REGISTRY[id];
}
```

- [ ] **Step 5: Run the test to verify it passes.** Run: `pnpm test publisher-signals.test` — Expected: PASS (3 tests).

- [ ] **Step 6: Commit.**

```bash
git add src/lib/geo-audit/signals/author-credibility.ts src/lib/geo-audit/signals/cited-sources.ts src/lib/geo-audit/signals/original-data.ts src/lib/geo-audit/signals/index.ts src/lib/geo-audit/signals/publisher-signals.test.ts
git commit -m "feat: add publisher GEO signals"
```

---

## Task 4: Profiles, active-signal resolution, and goal boosts

**Files:**
- Create: `src/lib/geo-audit/profiles.ts`
- Test: `src/lib/geo-audit/profiles.test.ts`

- [ ] **Step 1: Write the failing test.** Create `src/lib/geo-audit/profiles.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { activeSignalIds, PROFILES, GOAL_BOOSTS, UNIVERSAL_CORE } from './profiles';

describe('profiles', () => {
  it('saas active set = core + saas bonus', () => {
    expect(activeSignalIds('saas')).toEqual([...UNIVERSAL_CORE, 'pricing', 'comparison', 'case-study']);
  });

  it('publisher active set = core + publisher bonus', () => {
    expect(activeSignalIds('publisher')).toEqual([...UNIVERSAL_CORE, 'author-credibility', 'cited-sources', 'original-data']);
  });

  it('other is core-only', () => {
    expect(activeSignalIds('other')).toEqual([...UNIVERSAL_CORE]);
  });

  it('has a profile entry for every site type', () => {
    for (const t of ['saas', 'ecommerce', 'local', 'publisher', 'services', 'other'] as const) {
      expect(PROFILES[t]).toBeDefined();
    }
  });

  it('every goal boosts at least one tag', () => {
    for (const g of ['get-cited', 'win-comparisons', 'build-trust'] as const) {
      expect(GOAL_BOOSTS[g].tags.length).toBeGreaterThan(0);
      expect(GOAL_BOOSTS[g].multiplier).toBeGreaterThan(1);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.** Run: `pnpm test profiles.test` — Expected: FAIL.

- [ ] **Step 3: Write the implementation.** Create `src/lib/geo-audit/profiles.ts`:

```ts
import type { Goal, SignalTag, SiteType } from './types';

export const UNIVERSAL_CORE = ['social-proof', 'differentiation'] as const;

export type SiteTypeProfile = {
  id: SiteType;
  label: string;
  detectionHint: string;
  bonusSignals: string[];
};

export const PROFILES: Record<SiteType, SiteTypeProfile> = {
  saas: {
    id: 'saas', label: 'B2B SaaS / software',
    detectionHint: 'sells software or a subscription product; has pricing, features, integrations, docs',
    bonusSignals: ['pricing', 'comparison', 'case-study'],
  },
  publisher: {
    id: 'publisher', label: 'Blog / publisher',
    detectionHint: 'primarily articles, posts, news, or editorial content; many article pages',
    bonusSignals: ['author-credibility', 'cited-sources', 'original-data'],
  },
  ecommerce: {
    id: 'ecommerce', label: 'Ecommerce / store',
    detectionHint: 'sells physical or digital products with product pages, cart, checkout',
    bonusSignals: [],
  },
  local: {
    id: 'local', label: 'Local business',
    detectionHint: 'a physical location or service area; hours, address, bookings, menu',
    bonusSignals: [],
  },
  services: {
    id: 'services', label: 'Agency / services',
    detectionHint: 'offers professional services or consulting; portfolio, clients, engagements',
    bonusSignals: [],
  },
  other: {
    id: 'other', label: 'Other',
    detectionHint: 'does not clearly fit the other categories',
    bonusSignals: [],
  },
};

export function activeSignalIds(type: SiteType): string[] {
  return [...UNIVERSAL_CORE, ...PROFILES[type].bonusSignals];
}

export const GOAL_BOOSTS: Record<Goal, { tags: SignalTag[]; multiplier: number }> = {
  'get-cited': { tags: ['evidence'], multiplier: 1.5 },
  'win-comparisons': { tags: ['comparison', 'value'], multiplier: 1.5 },
  'build-trust': { tags: ['proof', 'trust'], multiplier: 1.5 },
};
```

- [ ] **Step 4: Run the test to verify it passes.** Run: `pnpm test profiles.test` — Expected: PASS (5 tests).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/geo-audit/profiles.ts src/lib/geo-audit/profiles.test.ts
git commit -m "feat: add GEO site-type profiles and goal boosts"
```

---

## Task 5: Normalized, goal-weighted scoring

**Files:**
- Modify: `src/lib/geo-audit/score.ts` (replace v1 contents)
- Modify: `src/lib/geo-audit/score.test.ts` (replace v1 contents)

- [ ] **Step 1: Write the failing test.** Replace `src/lib/geo-audit/score.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { effectiveWeight, scoreActiveSignals } from './score';
import type { GeoSignalResult } from './types';
import { getSignal } from './signals/index';

describe('effectiveWeight', () => {
  it('applies the goal multiplier when a tag matches', () => {
    const caseStudy = getSignal('case-study')!; // tags: evidence, proof
    expect(effectiveWeight(caseStudy, 'get-cited')).toBe(45); // 30 * 1.5 (evidence)
    expect(effectiveWeight(caseStudy, 'win-comparisons')).toBe(30); // no tag overlap
  });
});

const result = (signal: string, weight: number, present: boolean): GeoSignalResult => ({
  signal, label: signal, tags: [], weight, present, artifacts: [], pages: [], recommendation: present ? null : 'x',
});

describe('scoreActiveSignals', () => {
  it('normalizes present effective weight to 0-100', () => {
    // weights 40 + 30 + 30 = 100; pricing(40) + case-study(30) present => 70
    const r = scoreActiveSignals([
      result('pricing', 40, true),
      result('comparison', 30, false),
      result('case-study', 30, true),
    ]);
    expect(r.score).toBe(70);
    expect(r.tier).toBe('good');
  });

  it('stays 0-100 regardless of raw weight magnitudes', () => {
    const r = scoreActiveSignals([
      result('a', 25, true),
      result('b', 15, true),
      result('c', 30, false),
    ]); // present 40 of 70 => 57
    expect(r.score).toBe(57);
  });

  it('scores 0 when the active set is empty', () => {
    expect(scoreActiveSignals([]).score).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.** Run: `pnpm test geo-audit/score.test` — Expected: FAIL.

- [ ] **Step 3: Write the implementation.** Replace `src/lib/geo-audit/score.ts` with:

```ts
import { tierFor } from '@/lib/citation-audit/rubric';
import type { Tier } from '@/lib/citation-audit/types';
import type { GeoSignalDef, GeoSignalResult, Goal } from './types';
import { GOAL_BOOSTS } from './profiles';

/** Weight after applying the goal's tag boost (multiplier when any tag overlaps). */
export function effectiveWeight(sig: GeoSignalDef, goal: Goal): number {
  const boost = GOAL_BOOSTS[goal];
  const boosted = sig.tags.some((t) => boost.tags.includes(t));
  return Math.round(sig.defaultWeight * (boosted ? boost.multiplier : 1));
}

/** Normalize present effective weight to 0–100 over the active set. */
export function scoreActiveSignals(signals: GeoSignalResult[]): { score: number; tier: Tier } {
  const total = signals.reduce((a, s) => a + s.weight, 0);
  if (total === 0) return { score: 0, tier: 'poor' };
  const earned = signals.reduce((a, s) => a + (s.present ? s.weight : 0), 0);
  const score = Math.round((earned / total) * 100);
  return { score, tier: tierFor(score) };
}
```

- [ ] **Step 4: Run the test to verify it passes.** Run: `pnpm test geo-audit/score.test` — Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/geo-audit/score.ts src/lib/geo-audit/score.test.ts
git commit -m "feat: normalized goal-weighted GEO scoring"
```

---

## Task 6: Generic LLM confirm (registry-driven)

**Files:**
- Modify: `src/lib/geo-audit/confirm.ts` (replace v1 contents)
- Modify: `src/lib/geo-audit/confirm.test.ts` (replace v1 contents)

- [ ] **Step 1: Write the failing test.** Replace `src/lib/geo-audit/confirm.test.ts` with:

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

  it('uses the signal registry prompt and returns structured output', async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { confirmed: true, artifact: 'from $29/mo' } } as never);
    const res = await confirmCandidate('pricing', { url: 'https://acme.test/pricing', path: 'pricing', markdown: 'Plans from $29/mo.' }, 'Acme');
    expect(res).toEqual({ confirmed: true, artifact: 'from $29/mo' });
    const call = vi.mocked(generateText).mock.calls[0][0];
    expect(call.model).toBe('google/gemini-3.1-flash-lite');
    expect(String(call.system)).toContain('PRICING');
  });

  it('throws on an unknown signal id', async () => {
    await expect(confirmCandidate('nope', { url: 'x', path: 'x', markdown: 'x' }, 'Acme')).rejects.toThrow(/unknown signal/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.** Run: `pnpm test geo-audit/confirm.test` — Expected: FAIL.

- [ ] **Step 3: Write the implementation.** Replace `src/lib/geo-audit/confirm.ts` with:

```ts
import { generateText, Output } from 'ai';
import { z } from 'zod';
import type { GeoConfirm, GeoPageInput } from './types';
import { getSignal } from './signals/index';

const MODEL = 'google/gemini-3.1-flash-lite';
const MAX_INPUT_CHARS = 6000;

const confirmSchema = z.object({
  confirmed: z.boolean(),
  artifact: z.string().nullable(),
});

export async function confirmCandidate(
  signalId: string,
  page: GeoPageInput,
  entityName: string,
): Promise<GeoConfirm> {
  const sig = getSignal(signalId);
  if (!sig) throw new Error(`unknown signal: ${signalId}`);
  const { output } = await generateText({
    model: MODEL,
    output: Output.object({ schema: confirmSchema }),
    system: sig.confirmPrompt(entityName),
    prompt: `URL: ${page.url}\n\n---\n${page.markdown.slice(0, MAX_INPUT_CHARS)}\n---`,
    maxRetries: 3,
  });
  return { confirmed: output.confirmed, artifact: output.artifact };
}
```

Note: the `confirmPrompt` strings already contain an uppercase keyword (e.g. "PUBLIC PRICING") so the test's `toContain('PRICING')` holds.

- [ ] **Step 4: Run the test to verify it passes.** Run: `pnpm test geo-audit/confirm.test` — Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/geo-audit/confirm.ts src/lib/geo-audit/confirm.test.ts
git commit -m "refactor: registry-driven GEO confirm"
```

---

## Task 7: Analyze over the active set + crawled pages

**Files:**
- Modify: `src/lib/geo-audit/analyze.ts` (replace v1 contents)
- Modify: `src/lib/geo-audit/analyze.test.ts` (replace v1 contents)

- [ ] **Step 1: Write the failing test.** Replace `src/lib/geo-audit/analyze.test.ts` with:

```ts
import { describe, it, expect, vi } from 'vitest';
import { analyzeGeoPages } from './analyze';
import type { GeoConfirmFn, GeoPageInput } from './types';

const pages: GeoPageInput[] = [
  { url: 'https://acme.test/pricing', path: 'pricing', markdown: 'Plans from $29/mo.' },
  { url: 'https://acme.test/customers/x', path: 'customers/x', markdown: 'Achieved 40% faster onboarding.' },
  { url: 'https://acme.test/about', path: 'about', markdown: 'Why choose us: the only tool that…' },
];

describe('analyzeGeoPages', () => {
  it('resolves the active set for the site type, confirms, and scores', async () => {
    const confirm: GeoConfirmFn = vi.fn(async (signalId) => {
      if (signalId === 'pricing') return { confirmed: true, artifact: 'from $29/mo' };
      if (signalId === 'case-study') return { confirmed: true, artifact: '40% faster onboarding' };
      if (signalId === 'differentiation') return { confirmed: true, artifact: 'the only tool that…' };
      return { confirmed: false, artifact: null };
    });

    const result = await analyzeGeoPages(pages, { entityName: 'Acme', siteType: 'saas', goal: 'win-comparisons' }, confirm);

    const ids = result.signals.map((s) => s.signal);
    expect(ids).toEqual(['social-proof', 'differentiation', 'pricing', 'comparison', 'case-study']);
    expect(result.signals.find((s) => s.signal === 'pricing')!.present).toBe(true);
    expect(result.signals.find((s) => s.signal === 'comparison')!.present).toBe(false);
    expect(result.siteType).toBe('saas');
    expect(result.goal).toBe('win-comparisons');
    expect(result.score).toBeGreaterThan(0);
  });

  it('only confirms gated candidates (no gate → not present, not called)', async () => {
    const confirm = vi.fn<GeoConfirmFn>(async () => ({ confirmed: true, artifact: 'x' }));
    const result = await analyzeGeoPages(
      [{ url: 'https://acme.test/', path: 'index', markdown: 'nothing relevant here' }],
      { entityName: 'Acme', siteType: 'other', goal: 'get-cited' },
      confirm,
    );
    expect(result.signals.every((s) => !s.present)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.** Run: `pnpm test analyze.test` — Expected: FAIL.

- [ ] **Step 3: Write the implementation.** Replace `src/lib/geo-audit/analyze.ts` with:

```ts
import { activeSignalIds } from './profiles';
import { getSignal } from './signals/index';
import { effectiveWeight, scoreActiveSignals } from './score';
import type {
  GeoConfirmFn, GeoPageInput, GeoSignalResult, Goal, SiteGeoAuditResult, SiteType,
} from './types';

const CANDIDATE_CAP = 5;

export async function analyzeGeoPages(
  pages: GeoPageInput[],
  ctx: { entityName: string; siteType: SiteType; goal: Goal },
  confirm: GeoConfirmFn,
): Promise<SiteGeoAuditResult> {
  const ids = activeSignalIds(ctx.siteType);
  let candidates = 0;
  let confirmCalls = 0;
  const signals: GeoSignalResult[] = [];

  for (const id of ids) {
    const sig = getSignal(id);
    if (!sig) continue;
    const gated = pages.filter((p) => sig.gate(p) !== null).slice(0, CANDIDATE_CAP);
    candidates += gated.length;

    const artifacts: string[] = [];
    const confirmedPages: string[] = [];
    for (const page of gated) {
      confirmCalls += 1;
      const res = await confirm(id, page, ctx.entityName);
      if (res.confirmed) {
        confirmedPages.push(page.url);
        if (res.artifact) artifacts.push(res.artifact);
      }
    }
    const present = confirmedPages.length > 0;
    signals.push({
      signal: id,
      label: sig.label,
      tags: sig.tags,
      weight: effectiveWeight(sig, ctx.goal),
      present,
      artifacts,
      pages: confirmedPages,
      recommendation: present ? null : sig.recommendation,
    });
  }

  const { score, tier } = scoreActiveSignals(signals);
  return {
    siteType: ctx.siteType,
    goal: ctx.goal,
    score,
    tier,
    signals,
    metadata: { pagesScanned: pages.length, candidates, confirmCalls },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes.** Run: `pnpm test analyze.test` — Expected: PASS (2 tests).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/geo-audit/analyze.ts src/lib/geo-audit/analyze.test.ts
git commit -m "refactor: analyze GEO over active signal set with goal weighting"
```

---

## Task 8: Site-type classification

**Files:**
- Create: `src/lib/geo-audit/classify.ts`
- Test: `src/lib/geo-audit/classify.test.ts`

- [ ] **Step 1: Write the failing test.** Create `src/lib/geo-audit/classify.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return { ...actual, generateText: vi.fn() };
});

import { generateText } from 'ai';
import { classifyFromSignals } from './classify';

describe('classifyFromSignals', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the model classification', async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { siteType: 'publisher', confidence: 0.86 } } as never);
    const res = await classifyFromSignals({
      histogram: { article: 14, homepage: 1, about: 1, other: 3 },
      description: 'A blog about coffee.',
      entityName: 'CoffeeBlog',
    });
    expect(res).toEqual({ siteType: 'publisher', confidence: 0.86 });
    const call = vi.mocked(generateText).mock.calls[0][0];
    expect(String(call.prompt)).toContain('article: 14');
  });

  it('clamps an out-of-range or unknown type to other', async () => {
    vi.mocked(generateText).mockResolvedValue({ output: { siteType: 'banana', confidence: 2 } } as never);
    const res = await classifyFromSignals({ histogram: {}, description: null, entityName: 'X' });
    expect(res.siteType).toBe('other');
    expect(res.confidence).toBeLessThanOrEqual(1);
    expect(res.confidence).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.** Run: `pnpm test classify.test` — Expected: FAIL.

- [ ] **Step 3: Write the implementation.** Create `src/lib/geo-audit/classify.ts`:

```ts
import { generateText, Output } from 'ai';
import { z } from 'zod';
import type { SiteType } from './types';
import { PROFILES } from './profiles';

const MODEL = 'google/gemini-3.1-flash-lite';
const TYPES: SiteType[] = ['saas', 'ecommerce', 'local', 'publisher', 'services', 'other'];

const schema = z.object({
  siteType: z.string(),
  confidence: z.number(),
});

function profileHints(): string {
  return TYPES.map((t) => `- ${t}: ${PROFILES[t].detectionHint}`).join('\n');
}

export type ClassifyInput = {
  histogram: Record<string, number>;   // page_type → count
  description: string | null;
  entityName: string;
};

export async function classifyFromSignals(input: ClassifyInput): Promise<{ siteType: SiteType; confidence: number }> {
  const hist = Object.entries(input.histogram)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ') || '(none)';

  const { output } = await generateText({
    model: MODEL,
    output: Output.object({ schema }),
    system: `You classify a website into exactly one type. Types:\n${profileHints()}\nReturn the best-fit type id and a confidence 0–1. If unclear, use "other" with low confidence.`,
    prompt: `Entity: ${input.entityName}\nDescription: ${input.description ?? '(none)'}\nPage-type counts: ${hist}\n\nClassify.`,
    maxRetries: 3,
  });

  const siteType = (TYPES as string[]).includes(output.siteType) ? (output.siteType as SiteType) : 'other';
  const confidence = Math.max(0, Math.min(1, Number(output.confidence) || 0));
  return { siteType, confidence };
}
```

- [ ] **Step 4: Run the test to verify it passes.** Run: `pnpm test classify.test` — Expected: PASS (2 tests).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/geo-audit/classify.ts src/lib/geo-audit/classify.test.ts
git commit -m "feat: add GEO site-type classifier"
```

---

## Task 9: Cloudflare /crawl client

**Files:**
- Create: `src/lib/geo-audit/crawl.ts`
- Test: `src/lib/geo-audit/crawl.test.ts`

- [ ] **Step 1: Write the failing test.** Create `src/lib/geo-audit/crawl.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startCrawl, pollCrawl } from './crawl';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  process.env.CLOUDFLARE_ACCOUNT_ID = 'acct';
  process.env.CLOUDFLARE_API_TOKEN = 'tok';
});

describe('startCrawl', () => {
  it('POSTs the crawl with includePatterns and returns the job id', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, result: { id: 'job-1' } }) });
    const id = await startCrawl('https://acme.test', ['**/pricing**', '**/']);
    expect(id).toBe('job-1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/browser-rendering/crawl');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.url).toBe('https://acme.test');
    expect(body.formats).toEqual(['markdown']);
    expect(body.options.includePatterns).toContain('**/pricing**');
  });
});

describe('pollCrawl', () => {
  it('returns completed records', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, result: { status: 'completed', records: [
        { url: 'https://acme.test/pricing', status: 'completed', markdown: 'Plans from $29/mo.', metadata: { url: 'https://acme.test/pricing' } },
      ] } }),
    });
    const res = await pollCrawl('job-1');
    expect(res.status).toBe('completed');
    expect(res.pages).toEqual([{ url: 'https://acme.test/pricing', path: 'pricing', markdown: 'Plans from $29/mo.' }]);
  });

  it('reports a still-running job', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, result: { status: 'running', records: [] } }) });
    const res = await pollCrawl('job-1');
    expect(res.status).toBe('running');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.** Run: `pnpm test geo-audit/crawl.test` — Expected: FAIL.

- [ ] **Step 3: Write the implementation.** Create `src/lib/geo-audit/crawl.ts`:

```ts
import type { GeoPageInput } from './types';

const BASE = (acct: string) =>
  `https://api.cloudflare.com/client/v4/accounts/${acct}/browser-rendering/crawl`;

function creds(): { acct: string; token: string } {
  const acct = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!acct || !token) throw new Error('Cloudflare Browser Rendering credentials are not configured.');
  return { acct, token };
}

export async function startCrawl(rootUrl: string, includePatterns: string[]): Promise<string> {
  const { acct, token } = creds();
  const res = await fetch(BASE(acct), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: rootUrl,
      source: 'sitemaps',
      formats: ['markdown'],
      render: false,
      limit: 60,
      crawlPurposes: ['ai-input'],
      options: { includePatterns: Array.from(new Set(includePatterns)) },
    }),
  });
  if (!res.ok) throw new Error(`Cloudflare crawl start failed: ${res.status}`);
  const body = (await res.json()) as { success: boolean; result?: { id: string } };
  if (!body.success || !body.result?.id) throw new Error('Cloudflare crawl start returned no job id');
  return body.result.id;
}

type CrawlRecord = { url: string; status: string; markdown?: string; metadata?: { url?: string } };

export type CrawlPoll = {
  status: 'running' | 'completed' | 'failed';
  pages: GeoPageInput[];
};

function pathOf(url: string): string {
  try {
    const p = new URL(url).pathname.replace(/^\/|\/$/g, '');
    return p === '' ? 'index' : p;
  } catch {
    return url;
  }
}

export async function pollCrawl(jobId: string): Promise<CrawlPoll> {
  const { acct, token } = creds();
  const res = await fetch(`${BASE(acct)}/${jobId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Cloudflare crawl poll failed: ${res.status}`);
  const body = (await res.json()) as {
    success: boolean;
    result?: { status: string; records?: CrawlRecord[] };
  };
  const raw = body.result?.status ?? 'failed';
  const status: CrawlPoll['status'] =
    raw === 'completed' ? 'completed' : /error|cancel|fail/i.test(raw) ? 'failed' : 'running';
  const pages: GeoPageInput[] = (body.result?.records ?? [])
    .filter((r) => r.status === 'completed' && typeof r.markdown === 'string')
    .map((r) => ({ url: r.metadata?.url ?? r.url, path: pathOf(r.metadata?.url ?? r.url), markdown: r.markdown as string }));
  return { status, pages };
}
```

- [ ] **Step 4: Run the test to verify it passes.** Run: `pnpm test geo-audit/crawl.test` — Expected: PASS (3 tests).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/geo-audit/crawl.ts src/lib/geo-audit/crawl.test.ts
git commit -m "feat: add Cloudflare /crawl client for GEO"
```

---

## Task 10: Data model — site + audit columns, serializer

**Files:**
- Modify: `src/db/schema.ts` (sites + siteGeoAudits)
- Modify: `src/lib/geo-audit/serialize.ts`
- Test: `src/lib/geo-audit/serialize.test.ts` (replace v1 contents)
- Generates: a `drizzle/` migration

- [ ] **Step 1: Add the columns.** In `src/db/schema.ts`, inside the `sites` table column block (after `faviconUrl`), add:

```ts
    siteType: text('site_type'),
    geoGoal: text('geo_goal'),
```

In the `siteGeoAudits` table: widen the `status` enum and add columns. Replace its `status` line and add the new columns so the block reads:

```ts
    status: text('status', { enum: ['pending', 'running', 'succeeded', 'failed'] }).notNull(),
    score: integer('score'),
    tier: text('tier', { enum: ['poor', 'fair', 'good', 'excellent'] }),
    results: text('results'),
    errorReason: text('error_reason'),
    errorMessage: text('error_message'),
    llmMsUsed: integer('llm_ms_used'),
    crawlJobId: text('crawl_job_id'),
    workflowRunId: text('workflow_run_id'),
    stage: text('stage', { enum: ['crawling', 'confirming', 'scoring'] }),
    siteType: text('site_type'),
    goal: text('goal'),
    fetchedAt: text('fetched_at').notNull().default(sql`(current_timestamp)`),
    trigger: text('trigger', { enum: ['manual'] }).notNull(),
```

- [ ] **Step 2: Generate + apply the migration.** Run: `pnpm db:generate` (Expected: a new `drizzle/00NN_*.sql` adding the columns and not dropping data) then `pnpm db:push` (the project's working sync against the dev DB).

- [ ] **Step 3: Write the failing serializer test.** Replace `src/lib/geo-audit/serialize.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { serializeSiteGeoAudit } from './serialize';
import type { SiteGeoAudit } from '@/db/schema';

const row: SiteGeoAudit = {
  id: 1, uid: 'geo-1', siteId: 10, generationId: 5,
  status: 'succeeded', score: 70, tier: 'good',
  results: JSON.stringify({ siteType: 'saas', goal: 'get-cited', score: 70, tier: 'good', signals: [], metadata: { pagesScanned: 3, candidates: 2, confirmCalls: 2 } }),
  errorReason: null, errorMessage: null, llmMsUsed: 1200,
  crawlJobId: 'job-1', workflowRunId: 'run-1', stage: null,
  siteType: 'saas', goal: 'get-cited',
  fetchedAt: '2026-06-02T00:00:00Z', trigger: 'manual',
};

describe('serializeSiteGeoAudit', () => {
  it('surfaces status, stage, siteType, goal and parses results', () => {
    const out = serializeSiteGeoAudit(row, 'site-uid');
    expect(out.id).toBe('geo-1');
    expect(out.status).toBe('succeeded');
    expect(out.siteType).toBe('saas');
    expect(out.goal).toBe('get-cited');
    expect(out.results?.siteType).toBe('saas');
  });

  it('exposes stage for an in-flight run', () => {
    const out = serializeSiteGeoAudit({ ...row, status: 'running', stage: 'confirming', results: null, score: null, tier: null }, 'site-uid');
    expect(out.status).toBe('running');
    expect(out.stage).toBe('confirming');
    expect(out.results).toBeNull();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails.** Run: `pnpm test geo-audit/serialize.test` — Expected: FAIL.

- [ ] **Step 5: Update the serializer.** Replace `src/lib/geo-audit/serialize.ts` with:

```ts
import type { SiteGeoAudit } from '@/db/schema';
import type { SiteGeoAuditResult } from './types';

export function serializeSiteGeoAudit(a: SiteGeoAudit, siteUid: string) {
  return {
    id: a.uid,
    siteId: siteUid,
    status: a.status,
    stage: a.stage,
    siteType: a.siteType,
    goal: a.goal,
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

- [ ] **Step 6: Run the test to verify it passes.** Run: `pnpm test geo-audit/serialize.test` — Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add src/db/schema.ts drizzle/ src/lib/geo-audit/serialize.ts src/lib/geo-audit/serialize.test.ts
git commit -m "feat: extend GEO data model for tailoring + async status"
```

---

## Task 11: Process core + workflow + enqueue (crawl → confirm → score → persist)

**Files:**
- Create: `src/lib/geo-audit/process.ts` (the `processGeoAudit` orchestration core)
- Create: `src/lib/workflow/geo-audit-workflow.ts` (thin WDK wrapper)
- Create: `src/lib/geo-audit/enqueue.ts` (`enqueueGeoAudit` — creates row, starts workflow)
- Test: `src/lib/geo-audit/process.test.ts`
- Delete: `src/lib/geo-audit/run.ts`, `src/lib/geo-audit/run.test.ts`

**Dependency direction (avoids a cycle):** `enqueue.ts` → `geo-audit-workflow.ts` → `process.ts`. `process.ts` imports none of the other two. The workflow body and step mirror `src/lib/workflow/generate-site-files.ts` (`'use workflow'` + `'use step'`); the step calls `processGeoAudit`, which reads/updates the `siteGeoAudits` row by id and polls the Cloudflare crawl in a bounded loop.

- [ ] **Step 1: Write the failing test for the processing core.** Create `src/lib/geo-audit/process.test.ts`. It tests `processGeoAudit` directly (no WDK runtime needed), mocking crawl + confirm + using the test DB:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users, siteGeoAudits } from '@/db/schema';
import { eq } from 'drizzle-orm';

vi.mock('./crawl', () => ({ startCrawl: vi.fn(), pollCrawl: vi.fn() }));
vi.mock('./confirm', () => ({ confirmCandidate: vi.fn() }));

import { startCrawl, pollCrawl } from './crawl';
import { confirmCandidate } from './confirm';
import { processGeoAudit } from './process';

async function seed(siteType = 'saas', goal = 'get-cited') {
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'U', email: 'u@u.test' }).returning();
  const [s] = await db.insert(sites).values({
    userId: u.id, name: 'Acme', rootUrl: 'https://acme.test',
    webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_acme',
    siteType, geoGoal: goal,
  }).returning();
  const [a] = await db.insert(siteGeoAudits).values({
    siteId: s.id, status: 'pending', trigger: 'manual', siteType, goal,
  }).returning();
  return { site: s, audit: a };
}

describe('processGeoAudit', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  it('crawls, confirms, scores, and marks the row succeeded', async () => {
    const { audit } = await seed('saas', 'get-cited');
    vi.mocked(startCrawl).mockResolvedValue('job-1');
    vi.mocked(pollCrawl).mockResolvedValue({
      status: 'completed',
      pages: [{ url: 'https://acme.test/pricing', path: 'pricing', markdown: 'Plans from $29/mo.' }],
    });
    vi.mocked(confirmCandidate).mockResolvedValue({ confirmed: true, artifact: 'from $29/mo' });

    await processGeoAudit(audit.id);

    const [row] = await getDb().select().from(siteGeoAudits).where(eq(siteGeoAudits.id, audit.id));
    expect(row.status).toBe('succeeded');
    expect(row.score).toBeGreaterThan(0);
    expect(row.crawlJobId).toBe('job-1');
  });

  it('marks the row failed when the crawl fails', async () => {
    const { audit } = await seed();
    vi.mocked(startCrawl).mockResolvedValue('job-2');
    vi.mocked(pollCrawl).mockResolvedValue({ status: 'failed', pages: [] });

    await processGeoAudit(audit.id);
    const [row] = await getDb().select().from(siteGeoAudits).where(eq(siteGeoAudits.id, audit.id));
    expect(row.status).toBe('failed');
    expect(row.errorReason).toBe('crawl_failed');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.** Run: `pnpm test geo-audit/enqueue.test` — Expected: FAIL.

- [ ] **Step 3: Write the processing core.** Create `src/lib/geo-audit/process.ts` (imports nothing from `enqueue.ts` or the workflow, so the dependency graph stays acyclic):

```ts
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sites, siteGeoAudits } from '@/db/schema';
import type { SiteGeoAudit } from '@/db/schema';
import { startCrawl, pollCrawl } from './crawl';
import { confirmCandidate } from './confirm';
import { analyzeGeoPages } from './analyze';
import { activeSignalIds } from './profiles';
import { getSignal } from './signals/index';
import type { Goal, SiteType } from './types';

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 40; // ~2 min ceiling

export function includePatternsFor(siteType: SiteType): string[] {
  const patterns: string[] = ['**/', '**/about**'];
  for (const id of activeSignalIds(siteType)) {
    const sig = getSignal(id);
    if (sig) patterns.push(...sig.urlPatterns);
  }
  return Array.from(new Set(patterns));
}

async function setRow(id: number, fields: Partial<SiteGeoAudit>): Promise<void> {
  await getDb().update(siteGeoAudits).set(fields).where(eq(siteGeoAudits.id, id));
}

/** Orchestration core — called by the workflow step; testable directly. */
export async function processGeoAudit(auditId: number): Promise<void> {
  const db = getDb();
  const [audit] = await db.select().from(siteGeoAudits).where(eq(siteGeoAudits.id, auditId));
  if (!audit) return;
  const [site] = await db.select().from(sites).where(eq(sites.id, audit.siteId));
  if (!site) {
    await setRow(auditId, { status: 'failed', errorReason: 'no_site', errorMessage: 'Site not found' });
    return;
  }

  const siteType = (audit.siteType ?? 'other') as SiteType;
  const goal = (audit.goal ?? 'get-cited') as Goal;
  const t0 = Date.now();

  try {
    await setRow(auditId, { status: 'running', stage: 'crawling' });
    const jobId = await startCrawl(site.rootUrl, includePatternsFor(siteType));
    await setRow(auditId, { crawlJobId: jobId });

    let poll = await pollCrawl(jobId);
    for (let i = 0; i < MAX_POLLS && poll.status === 'running'; i++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      poll = await pollCrawl(jobId);
    }
    if (poll.status !== 'completed') {
      await setRow(auditId, { status: 'failed', errorReason: 'crawl_failed', errorMessage: `Crawl ${poll.status}` });
      return;
    }
    if (poll.pages.length === 0) {
      await setRow(auditId, { status: 'failed', errorReason: 'no_pages', errorMessage: 'Crawl returned no pages' });
      return;
    }

    await setRow(auditId, { stage: 'confirming' });
    const result = await analyzeGeoPages(
      poll.pages,
      { entityName: site.displayName ?? site.name, siteType, goal },
      confirmCandidate,
    );

    await setRow(auditId, {
      status: 'succeeded',
      stage: 'scoring',
      score: result.score,
      tier: result.tier,
      results: JSON.stringify(result),
      llmMsUsed: Date.now() - t0,
    });
  } catch (err) {
    await setRow(auditId, {
      status: 'failed',
      errorReason: 'analysis_failed',
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }
}
```

Create `src/lib/workflow/geo-audit-workflow.ts` (imports the core from `process.ts`):

```ts
import { processGeoAudit } from '@/lib/geo-audit/process';

export type GeoAuditPayload = { auditId: number };

/**
 * Entire body runs as a workflow. The single step does the durable
 * crawl → confirm → score → persist (it updates the audit row's status/stage
 * as it advances, so a client polling GET latest sees progress).
 */
export async function runGeoAuditWorkflow({ auditId }: GeoAuditPayload): Promise<{ ok: boolean }> {
  'use workflow';
  await geoAuditStep(auditId);
  return { ok: true };
}

async function geoAuditStep(auditId: number): Promise<void> {
  'use step';
  await processGeoAudit(auditId);
}
```

Create `src/lib/geo-audit/enqueue.ts` (creates the row + starts the workflow):

```ts
import { and, eq, desc } from 'drizzle-orm';
import { start } from 'workflow/api';
import { getDb } from '@/db';
import { generations, siteGeoAudits } from '@/db/schema';
import type { SiteGeoAudit } from '@/db/schema';
import type { Goal, SiteType } from './types';
import { runGeoAuditWorkflow } from '@/lib/workflow/geo-audit-workflow';

/** Create a pending audit row and start the workflow. */
export async function enqueueGeoAudit(opts: {
  siteId: number;
  siteType: SiteType;
  goal: Goal;
}): Promise<SiteGeoAudit> {
  const db = getDb();
  const [gen] = await db
    .select()
    .from(generations)
    .where(and(eq(generations.siteId, opts.siteId), eq(generations.status, 'succeeded')))
    .orderBy(desc(generations.createdAt))
    .limit(1);

  const [row] = await db
    .insert(siteGeoAudits)
    .values({
      siteId: opts.siteId,
      generationId: gen?.id ?? null,
      status: 'pending',
      trigger: 'manual',
      siteType: opts.siteType,
      goal: opts.goal,
    })
    .returning();

  const { runId } = await start(runGeoAuditWorkflow, [{ auditId: row.id }]);
  const [updated] = await db
    .update(siteGeoAudits)
    .set({ workflowRunId: runId })
    .where(eq(siteGeoAudits.id, row.id))
    .returning();
  return updated;
}
```

Then remove the v1 run module:

```bash
git rm src/lib/geo-audit/run.ts src/lib/geo-audit/run.test.ts
```

- [ ] **Step 4: Run the test to verify it passes.** Run: `pnpm test geo-audit/process.test` — Expected: PASS (2 tests). (The test exercises `processGeoAudit`; the WDK wrapper and `enqueueGeoAudit` are thin and covered indirectly + by the Task 12 route test.)

- [ ] **Step 5: Commit.**

```bash
git add src/lib/geo-audit/process.ts src/lib/workflow/geo-audit-workflow.ts src/lib/geo-audit/enqueue.ts src/lib/geo-audit/process.test.ts
git commit -m "feat: GEO audit workflow + async crawl/confirm/score orchestration"
```

---

## Task 12: API — classify, run (enqueue), latest

**Files:**
- Create: `src/app/api/sites/[id]/geo-audit/classify/route.ts`
- Modify: `src/app/api/sites/[id]/geo-audit/route.ts` (rewrite POST to enqueue; GET latest unchanged contract)
- Modify: `src/app/api/sites/[id]/geo-audit/route.test.ts` (update POST test)
- Create: `src/app/api/sites/[id]/geo-audit/classify/route.test.ts`
- Create: `src/lib/validators/geo-audit.ts`

- [ ] **Step 1: Write the validators.** Create `src/lib/validators/geo-audit.ts`:

```ts
import { z } from 'zod';

export const runGeoAuditBodySchema = z.object({
  siteType: z.enum(['saas', 'ecommerce', 'local', 'publisher', 'services', 'other']),
  goal: z.enum(['get-cited', 'win-comparisons', 'build-trust']),
}).strict();

export type RunGeoAuditBody = z.infer<typeof runGeoAuditBodySchema>;
```

- [ ] **Step 2: Write the failing classify test.** Create `src/app/api/sites/[id]/geo-audit/classify/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users, pageSummaryCache } from '@/db/schema';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/geo-audit/classify', () => ({ classifyFromSignals: vi.fn() }));

import { getCurrentUser } from '@/lib/auth';
import { classifyFromSignals } from '@/lib/geo-audit/classify';
import { POST } from './route';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function makeSite(email: string) {
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'X', email }).returning();
  const [s] = await db.insert(sites).values({
    userId: u.id, name: 'Acme', rootUrl: 'https://acme.test', description: 'A blog.',
    webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_acme',
  }).returning();
  return { user: u, site: s };
}

describe('POST /api/sites/[id]/geo-audit/classify', () => {
  beforeEach(async () => { vi.clearAllMocks(); await setupTestDb(); });

  it('401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await POST(new Request('http://t', { method: 'POST' }), ctx('00000000-0000-0000-0000-000000000000'));
    expect(res.status).toBe(401);
  });

  it('builds the histogram from page summaries and returns the classification', async () => {
    const { user, site } = await makeSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    await getDb().insert(pageSummaryCache).values([
      { siteId: site.id, urlPath: 'a', url: 'https://acme.test/a', contentHash: 'h1', summary: 's', pageType: 'article' },
      { siteId: site.id, urlPath: 'b', url: 'https://acme.test/b', contentHash: 'h2', summary: 's', pageType: 'article' },
      { siteId: site.id, urlPath: 'c', url: 'https://acme.test/c', contentHash: 'h3', summary: 's', pageType: 'about' },
    ]);
    vi.mocked(classifyFromSignals).mockResolvedValue({ siteType: 'publisher', confidence: 0.9 });

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(site.uid));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestedType).toBe('publisher');
    expect(body.confidence).toBe(0.9);
    const arg = vi.mocked(classifyFromSignals).mock.calls[0][0];
    expect(arg.histogram.article).toBe(2);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails.** Run: `pnpm test geo-audit/classify/route.test` — Expected: FAIL.

- [ ] **Step 4: Write the classify route.** Create `src/app/api/sites/[id]/geo-audit/classify/route.ts`:

```ts
import { ZodError } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { pageSummaryCache } from '@/db/schema';
import { ApiError, apiErrorResponse, assertOwnsSiteByUid, requireUserOrThrow } from '@/lib/auth-guards';
import { parseUid } from '@/lib/uid';
import { classifyFromSignals } from '@/lib/geo-audit/classify';

export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

async function parseSiteUid(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params;
  try { return parseUid(id); } catch (e) {
    if (e instanceof ZodError) throw new ApiError(400, 'validation', 'Site id must be a UUID');
    throw e;
  }
}

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const uid = await parseSiteUid(ctx);
    const site = await assertOwnsSiteByUid(uid, user.id);

    const rows = await getDb()
      .select({ pageType: pageSummaryCache.pageType })
      .from(pageSummaryCache)
      .where(eq(pageSummaryCache.siteId, site.id));
    const histogram: Record<string, number> = {};
    for (const r of rows) histogram[r.pageType] = (histogram[r.pageType] ?? 0) + 1;

    const { siteType, confidence } = await classifyFromSignals({
      histogram,
      description: site.description ?? null,
      entityName: site.displayName ?? site.name,
    });
    return Response.json({ suggestedType: siteType, confidence });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

- [ ] **Step 5: Rewrite the run route POST.** Replace `src/app/api/sites/[id]/geo-audit/route.ts` with:

```ts
import { ZodError } from 'zod';
import { ApiError, apiErrorResponse, assertOwnsSiteByUid, requireUserOrThrow } from '@/lib/auth-guards';
import { parseUid } from '@/lib/uid';
import { getDb } from '@/db';
import { sites } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { enqueueGeoAudit } from '@/lib/geo-audit/enqueue';
import { serializeSiteGeoAudit } from '@/lib/geo-audit/serialize';
import { runGeoAuditBodySchema } from '@/lib/validators/geo-audit';

export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

async function parseSiteUid(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params;
  try { return parseUid(id); } catch (e) {
    if (e instanceof ZodError) throw new ApiError(400, 'validation', 'Site id must be a UUID');
    throw e;
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const uid = await parseSiteUid(ctx);
    const site = await assertOwnsSiteByUid(uid, user.id);
    const body = runGeoAuditBodySchema.safeParse(await req.json());
    if (!body.success) throw new ApiError(400, 'validation', body.error.message);

    // Persist the confirmed type/goal on the site for reuse on later runs.
    await getDb().update(sites).set({ siteType: body.data.siteType, geoGoal: body.data.goal }).where(eq(sites.id, site.id));

    const audit = await enqueueGeoAudit({ siteId: site.id, siteType: body.data.siteType, goal: body.data.goal });
    return Response.json({ audit: serializeSiteGeoAudit(audit, uid) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

The GET `latest` route (`src/app/api/sites/[id]/geo-audit/latest/route.ts`) is unchanged — it already prefers the latest succeeded row and falls back to latest-any (which now surfaces `pending`/`running` for polling).

- [ ] **Step 6: Update the run route test.** Replace the body of `src/app/api/sites/[id]/geo-audit/route.test.ts` to mock `enqueueGeoAudit` and assert the new contract:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users } from '@/db/schema';
import { eq } from 'drizzle-orm';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/geo-audit/enqueue', () => ({ enqueueGeoAudit: vi.fn() }));

import { getCurrentUser } from '@/lib/auth';
import { enqueueGeoAudit } from '@/lib/geo-audit/enqueue';
import { POST } from './route';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function makeSite(email: string) {
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'X', email }).returning();
  const [s] = await db.insert(sites).values({
    userId: u.id, name: 'S', rootUrl: 'https://s.test',
    webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_xxxx',
  }).returning();
  return { user: u, site: s };
}

describe('POST /api/sites/[id]/geo-audit', () => {
  beforeEach(async () => { vi.clearAllMocks(); await setupTestDb(); });

  it('401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await POST(new Request('http://t', { method: 'POST', body: '{}' }), ctx('00000000-0000-0000-0000-000000000000'));
    expect(res.status).toBe(401);
  });

  it('400 on an invalid body', async () => {
    const { user, site } = await makeSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const res = await POST(new Request('http://t', { method: 'POST', body: JSON.stringify({ siteType: 'bogus', goal: 'get-cited' }) }), ctx(site.uid));
    expect(res.status).toBe(400);
  });

  it('persists type/goal on the site and enqueues the audit', async () => {
    const { user, site } = await makeSite('b@b.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(enqueueGeoAudit).mockResolvedValue({
      uid: 'geo-1', status: 'pending', stage: null, siteType: 'saas', goal: 'get-cited',
      score: null, tier: null, fetchedAt: '2026-06-02T00:00:00Z', llmMsUsed: null,
      errorReason: null, errorMessage: null, results: null,
    } as never);

    const res = await POST(new Request('http://t', { method: 'POST', body: JSON.stringify({ siteType: 'saas', goal: 'get-cited' }) }), ctx(site.uid));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.audit.status).toBe('pending');
    expect(vi.mocked(enqueueGeoAudit)).toHaveBeenCalledWith({ siteId: site.id, siteType: 'saas', goal: 'get-cited' });
    const [updated] = await getDb().select().from(sites).where(eq(sites.id, site.id));
    expect(updated.siteType).toBe('saas');
    expect(updated.geoGoal).toBe('get-cited');
  });
});
```

- [ ] **Step 7: Run the tests to verify they pass.** Run: `pnpm test geo-audit/classify/route.test` then `pnpm test geo-audit/route.test` — Expected: PASS.

- [ ] **Step 8: Full engine verification.** Run, and confirm each:
- `pnpm test geo-audit` — all GEO suites pass.
- `pnpm tsc --noEmit 2>&1 | grep -E "geo-audit|workflow/geo" || echo "no feature type errors"` — no engine type errors. (~20 pre-existing unrelated test-fixture errors may remain; ignore.)
- `pnpm build` — succeeds.

- [ ] **Step 9: Commit.**

```bash
git add "src/app/api/sites/[id]/geo-audit/classify/" "src/app/api/sites/[id]/geo-audit/route.ts" "src/app/api/sites/[id]/geo-audit/route.test.ts" src/lib/validators/geo-audit.ts
git commit -m "feat: GEO classify + async run API"
```

---

## Engine verification (after all tasks)

- [ ] `pnpm test` — all suites green.
- [ ] `pnpm tsc --noEmit` — no new errors in `src/lib/geo-audit/**`, `src/lib/workflow/geo-audit-workflow.ts`, or the geo-audit API routes.
- [ ] `pnpm build` — succeeds.
- [ ] Manual API smoke (dev server): `POST /api/sites/:id/geo-audit/classify` returns a `suggestedType`; `POST /api/sites/:id/geo-audit` with `{siteType, goal}` returns a `pending` audit and the row advances to `succeeded` as the workflow runs (watch `GET …/geo-audit/latest`).

**Next:** Plan 2 (Experience) builds the two-step panel flow, running/progress state, and charts on top of these endpoints.
