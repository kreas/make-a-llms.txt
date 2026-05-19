# Citation Readiness Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the on-demand per-page Citation Readiness Audit (engine + internal & public API + Citations tab UI + public docs) on `feat/citation-readiness-audit`.

**Architecture:** Pure-function audit engine in `src/lib/citation-audit/` consumes raw HTML fetched via Cloudflare Browser Rendering, runs 15 weighted check modules (the spec's rubric) over a single parsed-page object, returns a deterministic score. A thin `runCitationAudit` library function wraps fetch + engine + persistence. Two route surfaces (session-authed `/api/sites/[id]/citation-audits/...` and bearer-authed `/api/v1/sites/[id]/citation-audits/...`) call the same library. Dashboard UI lives in `src/components/citations/` and slots into the existing site-detail tab pattern.

**Tech Stack:** Next.js 16 App Router, TypeScript, Drizzle ORM + Turso, jsdom, @mozilla/readability, htmlmetaparser, htmlparser2, compromise, text-readability, chrono-node, tldts, undici, Zod, zod-openapi, TanStack Query, ShadCN UI + Tailwind v4, Vitest + React Testing Library.

**Spec:** [docs/superpowers/specs/2026-05-19-citation-readiness-audit-design.md](../specs/2026-05-19-citation-readiness-audit-design.md)

**Background reading (skim before starting):**
- `src/db/schema.ts` — Drizzle table conventions; the existing `crawlerAudits` table is the template for `citationAudits`.
- `src/app/api/sites/[id]/audits/route.ts` + `audits/latest/route.ts` + `audits/route.test.ts` — the existing crawler-audit routes; ours mirror this shape exactly.
- `src/app/api/v1/generations/route.ts` — public v1 route pattern (bearer auth via `requireApiTokenOrThrow`).
- `src/lib/auth-guards.ts` — `requireUserOrThrow`, `requireApiTokenOrThrow`, `assertOwnsSiteByUid`, `ApiError`, `apiErrorResponse`.
- `src/lib/uid.ts` — `parseUid`.
- `src/test/db.ts` — `setupTestDb()` in-memory pattern (used by every route test).
- `src/lib/openapi/{schemas,routes,document}.ts` — how public endpoints get registered + documented.
- `src/components/crawlers/crawler-audit-tab.tsx` — the existing tab UI we model from.

---

## File Structure

**New files:**
- `src/lib/citation-audit/types.ts` — shared types (`AuditInput`, `AuditResult`, `CheckResult`, `ParsedPage`, `CheckContext`, `FetchOutcome`, tier strings).
- `src/lib/citation-audit/parse.ts` + `.test.ts` — one-pass HTML parsing.
- `src/lib/citation-audit/rubric.ts` + `.test.ts` — the 13 checks list, weights, tier mapping.
- `src/lib/citation-audit/score.ts` + `.test.ts` — weighted aggregation.
- `src/lib/citation-audit/checks/<id>.ts` + `.test.ts` — one file per check (13 total).
- `src/lib/citation-audit/checks/index.ts` — re-exports + ordered registry.
- `src/lib/citation-audit/audit-page.ts` + `.test.ts` — engine entry (`auditPage`).
- `src/lib/citation-audit/fetch.ts` + `.test.ts` — Cloudflare Browser Rendering client.
- `src/lib/citation-audit/run.ts` + `.test.ts` — `runCitationAudit` (DB persistence wrapper).
- `src/lib/citation-audit/index.ts` — public surface re-exports.
- `src/lib/validators/citation-audits.ts` + `.test.ts` — Zod schemas for inputs.
- `src/app/api/sites/[id]/citation-audits/route.ts` + `.test.ts` — internal GET (history) + POST (run).
- `src/app/api/sites/[id]/citation-audits/latest/route.ts` + `.test.ts` — internal GET latest-per-page.
- `src/app/api/sites/[id]/citation-audits/[auditUid]/route.ts` + `.test.ts` — internal GET single.
- `src/app/api/v1/sites/[id]/citation-audits/route.ts` + `.test.ts` — public GET + POST.
- `src/app/api/v1/sites/[id]/citation-audits/latest/route.ts` + `.test.ts` — public GET latest-per-page.
- `src/app/api/v1/sites/[id]/citation-audits/[auditUid]/route.ts` + `.test.ts` — public GET single.
- `src/components/citations/citations-tab.tsx` + `.test.tsx`.
- `src/components/citations/citations-page-table.tsx` + `.test.tsx`.
- `src/components/citations/citations-page-detail.tsx` + `.test.tsx`.
- `src/components/citations/citations-score-badge.tsx` + `.test.tsx`.
- `src/components/citations/citations-check-row.tsx` + `.test.tsx`.
- `src/components/citations/citations-tier-pill.tsx` + `.test.tsx`.
- `src/components/citations/citations-history-list.tsx` + `.test.tsx`.
- `content/docs/citation-audits.mdx`.

**Modified files:**
- `src/db/schema.ts` — add `citationAudits` table + types.
- `src/lib/openapi/schemas.ts` — add citation audit Zod schemas.
- `src/lib/openapi/routes.ts` — register the four public endpoints.
- `src/app/(app)/sites/[id]/site-detail-client.tsx` — add `<TabsTrigger value="citations">` and `<TabsContent>`.
- `content/docs/meta.json` — add new page to sidebar.
- `content/docs/quickstart.mdx` — short pointer to citation audits.
- `.env.example` — add `CLOUDFLARE_BROWSER_RENDERING_TOKEN`.
- `package.json` — add new dependencies.

---

### Task 1: Add `citationAudits` schema + migration

**Files:**
- Modify: `src/db/schema.ts`
- Create: `drizzle/<next>_citation_audits.sql` (generated)

- [ ] **Step 1: Add the table definition to `src/db/schema.ts`**

Place it directly after the existing `crawlerAudits` block. Match its style and helper conventions (`generateUid`, `sql\`(current_timestamp)\``).

```ts
export const citationAudits = sqliteTable(
  'citation_audits',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uid: text('uid').notNull().unique().$defaultFn(generateUid),
    siteId: integer('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    pageUrl: text('page_url').notNull(),
    status: text('status', { enum: ['succeeded', 'failed'] }).notNull(),
    score: integer('score'),
    tier: text('tier', { enum: ['poor', 'fair', 'good', 'excellent'] }),
    results: text('results'),
    errorReason: text('error_reason'),
    errorMessage: text('error_message'),
    fetchMs: integer('fetch_ms'),
    browserMsUsed: integer('browser_ms_used'),
    fetchedAt: text('fetched_at').notNull().default(sql`(current_timestamp)`),
    trigger: text('trigger', { enum: ['manual'] }).notNull(),
  },
  (t) => ({
    byPageRecent: index('cit_audit_by_page_recent').on(t.siteId, t.pageUrl, t.fetchedAt),
    bySiteRecent: index('cit_audit_by_site_recent').on(t.siteId, t.fetchedAt),
  }),
);

export type CitationAudit = typeof citationAudits.$inferSelect;
export type NewCitationAudit = typeof citationAudits.$inferInsert;
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: a new file appears in `drizzle/` named like `0010_<random_word>.sql` and a corresponding snapshot in `drizzle/meta/`.

- [ ] **Step 3: Inspect the generated SQL**

Run: `ls drizzle | tail -3 && cat drizzle/0010_*.sql` (substitute the actual number).
Expected: `CREATE TABLE citation_audits (...)` plus the two indexes. If the SQL looks wrong, fix the Drizzle definition and re-run `pnpm db:generate`.

- [ ] **Step 4: Apply migration to local dev db**

Run: `pnpm db:migrate`
Expected: prints `Migration applied`. The `local.db` now has the new table.

- [ ] **Step 5: Verify tests still pass with the new schema**

Run: `pnpm test`
Expected: full suite green. The new table is empty so existing tests are unaffected; this run catches any schema typo.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts drizzle/0010_*.sql drizzle/meta/0010_snapshot.json drizzle/meta/_journal.json
git commit -m "feat(db): add citation_audits table"
```

---

### Task 2: Install audit engine dependencies

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Install runtime deps**

Run: `pnpm add jsdom @mozilla/readability htmlmetaparser htmlparser2 compromise text-readability chrono-node tldts undici`
Expected: deps added, lockfile updated.

- [ ] **Step 2: Install dev types**

Run: `pnpm add -D @types/jsdom`
Expected: types added.

- [ ] **Step 3: Verify type-check passes**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat(deps): add citation audit parsing libraries"
```

---

### Task 3: Shared types module

**Files:**
- Create: `src/lib/citation-audit/types.ts`

- [ ] **Step 1: Write the types file**

```ts
// src/lib/citation-audit/types.ts

export type Tier = 'poor' | 'fair' | 'good' | 'excellent';

export type AuditInput = {
  url: string;
  entityName: string;
  html: string;
  fetchedAt: string;
};

export type CheckResult = {
  id: string;
  passed: boolean;
  score: number;        // 0–100, this check's sub-score
  weight: number;       // contribution to overall
  evidence: string[];
  recommendation: string | null;
};

export type AuditResult = {
  score: number;        // 0–100 overall
  tier: Tier;
  checks: CheckResult[];
  metadata: { parseMs: number };
};

export type JsonLdBlock = Record<string, unknown>;
export type MetaTag = { name?: string; property?: string; content: string };

export type ParsedPage = {
  url: string;
  rawHtml: string;
  dom: import('jsdom').JSDOM;
  document: Document;
  // From htmlmetaparser one-pass
  jsonLd: JsonLdBlock[];
  microdata: Record<string, unknown>;
  meta: MetaTag[];
  openGraph: Record<string, string>;
  // Readability extracted "main article"
  article: { title: string | null; textContent: string; lengthChars: number } | null;
  // Convenience aggregates
  title: string | null;
  canonical: string | null;
  metaDescription: string | null;
  headings: { level: 1 | 2 | 3 | 4 | 5 | 6; text: string }[];
  links: { href: string; text: string; isInternal: boolean }[];
};

export type CheckContext = {
  entityName: string;
};

export type CheckModule = {
  ID: string;
  WEIGHT: number;
  check: (parsed: ParsedPage, ctx: CheckContext) => CheckResult;
};
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/citation-audit/types.ts
git commit -m "feat(citation-audit): shared types module"
```

---

### Task 4: Parse module

**Files:**
- Create: `src/lib/citation-audit/parse.ts`, `src/lib/citation-audit/parse.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/citation-audit/parse.test.ts
import { describe, it, expect } from 'vitest';
import { parsePage } from './parse';

const FIXTURE_HTML = `<!doctype html>
<html><head>
  <title>AI Strategy Services — Example Co</title>
  <link rel="canonical" href="https://example.com/services/ai" />
  <meta name="description" content="Example Co builds practical AI strategy for mid-market companies.">
  <meta property="og:title" content="AI Strategy Services">
  <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Service","name":"AI Strategy","provider":{"@type":"Organization","name":"Example Co"}}
  </script>
</head>
<body>
  <h1>AI Strategy Services</h1>
  <p>Example Co helps mid-market companies adopt AI without the hype.</p>
  <h2>What does this include?</h2>
  <ul><li>Discovery workshops</li><li>Roadmaps</li></ul>
  <a href="https://example.com/about">About us</a>
  <a href="https://google.com">External</a>
</body></html>`;

describe('parsePage', () => {
  it('extracts title, canonical, meta description, headings, links, and json-ld', () => {
    const parsed = parsePage('https://example.com/services/ai', FIXTURE_HTML);
    expect(parsed.title).toBe('AI Strategy Services — Example Co');
    expect(parsed.canonical).toBe('https://example.com/services/ai');
    expect(parsed.metaDescription).toMatch(/practical AI strategy/);
    expect(parsed.headings.filter((h) => h.level === 1).length).toBe(1);
    expect(parsed.headings.some((h) => h.level === 2 && h.text.includes('?'))).toBe(true);
    expect(parsed.jsonLd.length).toBe(1);
    expect((parsed.jsonLd[0] as { '@type': string })['@type']).toBe('Service');
    expect(parsed.links.some((l) => l.isInternal && l.href.includes('/about'))).toBe(true);
    expect(parsed.links.some((l) => !l.isInternal && l.href.includes('google.com'))).toBe(true);
    expect(parsed.article?.textContent.length).toBeGreaterThan(0);
  });

  it('handles HTML with no head tags gracefully', () => {
    const parsed = parsePage('https://example.com/x', '<html><body><p>hi</p></body></html>');
    expect(parsed.title).toBeNull();
    expect(parsed.canonical).toBeNull();
    expect(parsed.headings.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `pnpm test src/lib/citation-audit/parse.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `parse.ts`**

```ts
// src/lib/citation-audit/parse.ts
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { parse as tldParse } from 'tldts';
import type { ParsedPage, JsonLdBlock, MetaTag } from './types';

function safeJsonParse(s: string): unknown | null {
  try { return JSON.parse(s); } catch { return null; }
}

export function parsePage(url: string, html: string): ParsedPage {
  const dom = new JSDOM(html, { url });
  const document = dom.window.document;

  const title = document.querySelector('title')?.textContent?.trim() ?? null;
  const canonical =
    document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;
  const metaDescription =
    document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null;

  const meta: MetaTag[] = Array.from(document.querySelectorAll('meta')).map((m) => ({
    name: m.getAttribute('name') ?? undefined,
    property: m.getAttribute('property') ?? undefined,
    content: m.getAttribute('content') ?? '',
  }));

  const openGraph: Record<string, string> = {};
  for (const m of meta) {
    if (m.property?.startsWith('og:')) openGraph[m.property.slice(3)] = m.content;
  }

  const jsonLd: JsonLdBlock[] = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach((node) => {
    const parsed = safeJsonParse(node.textContent ?? '');
    if (parsed == null) return;
    if (Array.isArray(parsed)) jsonLd.push(...(parsed as JsonLdBlock[]));
    else jsonLd.push(parsed as JsonLdBlock);
  });

  const headings: ParsedPage['headings'] = [];
  for (const level of [1, 2, 3, 4, 5, 6] as const) {
    document.querySelectorAll(`h${level}`).forEach((h) => {
      const text = h.textContent?.trim() ?? '';
      if (text) headings.push({ level, text });
    });
  }

  const pageHost = tldParse(url).domain;
  const links: ParsedPage['links'] = Array.from(document.querySelectorAll('a[href]')).map(
    (a) => {
      const href = a.getAttribute('href') ?? '';
      let absolute = href;
      try { absolute = new URL(href, url).toString(); } catch { /* ignore */ }
      const linkHost = tldParse(absolute).domain;
      return {
        href: absolute,
        text: (a.textContent ?? '').trim(),
        isInternal: !!pageHost && pageHost === linkHost,
      };
    },
  );

  let article: ParsedPage['article'] = null;
  try {
    const clone = new JSDOM(html, { url });
    const reader = new Readability(clone.window.document);
    const r = reader.parse();
    if (r) {
      article = {
        title: r.title ?? null,
        textContent: r.textContent.trim(),
        lengthChars: r.textContent.length,
      };
    }
  } catch {
    article = null;
  }

  return {
    url,
    rawHtml: html,
    dom,
    document,
    jsonLd,
    microdata: {},
    meta,
    openGraph,
    article,
    title,
    canonical,
    metaDescription,
    headings,
    links,
  };
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `pnpm test src/lib/citation-audit/parse.test.ts`
Expected: PASS, both cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/citation-audit/parse.ts src/lib/citation-audit/parse.test.ts
git commit -m "feat(citation-audit): one-pass HTML parser"
```

---

### Task 5: Rubric module (registry + weights)

**Files:**
- Create: `src/lib/citation-audit/rubric.ts`, `src/lib/citation-audit/rubric.test.ts`

The rubric file is the **single source of truth** for which checks ship in v1 and their weights. Per the spec: 13 checks, weights total 100.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/citation-audit/rubric.test.ts
import { describe, it, expect } from 'vitest';
import { RUBRIC, RUBRIC_WEIGHTS_TOTAL, tierFor } from './rubric';

describe('rubric', () => {
  it('contains exactly 15 entries', () => {
    expect(RUBRIC.length).toBe(15);
  });

  it('all entries have unique ids', () => {
    const ids = RUBRIC.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('weights total 100', () => {
    const sum = RUBRIC.reduce((acc, r) => acc + r.weight, 0);
    expect(sum).toBe(100);
    expect(RUBRIC_WEIGHTS_TOTAL).toBe(100);
  });

  it('maps tiers correctly', () => {
    expect(tierFor(0)).toBe('poor');
    expect(tierFor(49)).toBe('poor');
    expect(tierFor(50)).toBe('fair');
    expect(tierFor(69)).toBe('fair');
    expect(tierFor(70)).toBe('good');
    expect(tierFor(84)).toBe('good');
    expect(tierFor(85)).toBe('excellent');
    expect(tierFor(100)).toBe('excellent');
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `pnpm test src/lib/citation-audit/rubric.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `rubric.ts`**

```ts
// src/lib/citation-audit/rubric.ts
import type { Tier } from './types';

export type RubricEntry = { id: string; weight: number };

export const RUBRIC: readonly RubricEntry[] = [
  { id: 'h1-present', weight: 5 },
  { id: 'heading-hierarchy', weight: 5 },
  { id: 'meta-description', weight: 5 },
  { id: 'canonical', weight: 3 },
  { id: 'schema-type', weight: 10 },
  { id: 'schema-fields', weight: 5 },
  { id: 'answer-position', weight: 15 },
  { id: 'entity-first-paragraph', weight: 8 },
  { id: 'question-h2s', weight: 7 },
  { id: 'lists-tables', weight: 5 },
  { id: 'definitions', weight: 5 },
  { id: 'freshness', weight: 8 },
  { id: 'readability', weight: 5 },
  { id: 'named-entities', weight: 9 },
  { id: 'internal-links', weight: 5 },
] as const;

export const RUBRIC_WEIGHTS_TOTAL = RUBRIC.reduce((a, r) => a + r.weight, 0);

export function tierFor(score: number): Tier {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'fair';
  return 'poor';
}
```

Note: the spec talks about "13 checks" colloquially but the canonical rubric table in the spec has 15 weighted entries totalling 100 (5+5+5+3+10+5+15+8+7+5+5+8+5+9+5 = 100). This plan implements all 15. Weights must sum to 100 and ids must be unique — those are the load-bearing invariants.

- [ ] **Step 4: Run test, expect PASS**

Run: `pnpm test src/lib/citation-audit/rubric.test.ts`
Expected: PASS, all four cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/citation-audit/rubric.ts src/lib/citation-audit/rubric.test.ts
git commit -m "feat(citation-audit): rubric registry and tier mapping"
```

---

### Task 6: Score module

**Files:**
- Create: `src/lib/citation-audit/score.ts`, `src/lib/citation-audit/score.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/citation-audit/score.test.ts
import { describe, it, expect } from 'vitest';
import { aggregate } from './score';
import type { CheckResult } from './types';

function mkCheck(id: string, score: number, weight: number): CheckResult {
  return { id, score, weight, passed: score >= 70, evidence: [], recommendation: null };
}

describe('aggregate', () => {
  it('returns weighted average rounded to int', () => {
    const result = aggregate([mkCheck('a', 100, 50), mkCheck('b', 0, 50)]);
    expect(result.score).toBe(50);
    expect(result.tier).toBe('fair');
  });

  it('all-100 yields 100 / excellent', () => {
    const result = aggregate([mkCheck('a', 100, 25), mkCheck('b', 100, 75)]);
    expect(result.score).toBe(100);
    expect(result.tier).toBe('excellent');
  });

  it('all-0 yields 0 / poor', () => {
    const result = aggregate([mkCheck('a', 0, 50), mkCheck('b', 0, 50)]);
    expect(result.score).toBe(0);
    expect(result.tier).toBe('poor');
  });

  it('rounds to nearest integer', () => {
    const result = aggregate([mkCheck('a', 75, 1), mkCheck('b', 76, 1)]);
    // (75 + 76) / 2 = 75.5 → rounds to 76
    expect(result.score).toBe(76);
  });
});
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `pnpm test src/lib/citation-audit/score.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `score.ts`**

```ts
// src/lib/citation-audit/score.ts
import type { CheckResult, Tier } from './types';
import { tierFor } from './rubric';

export function aggregate(checks: CheckResult[]): { score: number; tier: Tier } {
  const totalWeight = checks.reduce((a, c) => a + c.weight, 0);
  if (totalWeight === 0) return { score: 0, tier: 'poor' };
  const weightedSum = checks.reduce((a, c) => a + c.score * c.weight, 0);
  const score = Math.round(weightedSum / totalWeight);
  return { score, tier: tierFor(score) };
}
```

- [ ] **Step 4: Run test, expect PASS**

Run: `pnpm test src/lib/citation-audit/score.test.ts`
Expected: PASS, all four cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/citation-audit/score.ts src/lib/citation-audit/score.test.ts
git commit -m "feat(citation-audit): score aggregation"
```

---

## Check tasks (7–21)

Each check task follows the same five-step TDD pattern: write failing test → run (expect fail) → implement → run (expect pass) → commit. The check files all conform to `CheckModule` (from `types.ts`):

```ts
export const ID = '<id>';
export const WEIGHT = <weight>;
export function check(parsed: ParsedPage, ctx: CheckContext): CheckResult { ... }
```

For each task below, the test file uses this skeleton (adjust IDs and assertions):

```ts
import { describe, it, expect } from 'vitest';
import { parsePage } from '../parse';
import { check, ID, WEIGHT } from './<file>';

function audit(html: string, opts: { entityName?: string; url?: string } = {}) {
  const parsed = parsePage(opts.url ?? 'https://example.com/', html);
  return check(parsed, { entityName: opts.entityName ?? 'Example Co' });
}
```

---

### Task 7: Check — `h1-present`

**Files:**
- Create: `src/lib/citation-audit/checks/h1-present.ts`, `.test.ts`

Heuristic: pass if exactly one `<h1>` exists. Score 100 on pass, 0 on fail. Recommendation references title if available.

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { parsePage } from '../parse';
import { check } from './h1-present';

const ok = '<html><head><title>T</title></head><body><h1>Hello</h1></body></html>';
const noH1 = '<html><body><h2>Sub</h2></body></html>';
const multipleH1 = '<html><body><h1>One</h1><h1>Two</h1></body></html>';

describe('h1-present', () => {
  it('passes when exactly one H1 exists', () => {
    const r = check(parsePage('https://x', ok), { entityName: 'X' });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(100);
    expect(r.recommendation).toBeNull();
    expect(r.evidence[0]).toMatch(/H1 found: 'Hello'/);
  });
  it('fails when no H1 exists', () => {
    const r = check(parsePage('https://x', noH1), { entityName: 'X' });
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
    expect(r.recommendation).toMatch(/Add a single/);
  });
  it('fails when more than one H1 exists', () => {
    const r = check(parsePage('https://x', multipleH1), { entityName: 'X' });
    expect(r.passed).toBe(false);
    expect(r.recommendation).toMatch(/single H1/);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm test src/lib/citation-audit/checks/h1-present.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/lib/citation-audit/checks/h1-present.ts
import type { CheckResult, ParsedPage, CheckContext } from '../types';

export const ID = 'h1-present';
export const WEIGHT = 5;

export function check(parsed: ParsedPage, _ctx: CheckContext): CheckResult {
  const h1s = parsed.headings.filter((h) => h.level === 1);
  if (h1s.length === 1) {
    return {
      id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: [`H1 found: '${h1s[0].text}'`],
      recommendation: null,
    };
  }
  if (h1s.length === 0) {
    return {
      id: ID, weight: WEIGHT, passed: false, score: 0,
      evidence: ['No <h1> element found.'],
      recommendation: 'Add a single, descriptive H1 to the top of the page that summarizes the topic.',
    };
  }
  return {
    id: ID, weight: WEIGHT, passed: false, score: 0,
    evidence: [`${h1s.length} H1 elements found.`],
    recommendation: 'Use a single H1 per page; demote the extra H1s to H2.',
  };
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `pnpm test src/lib/citation-audit/checks/h1-present.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/citation-audit/checks/h1-present.ts src/lib/citation-audit/checks/h1-present.test.ts
git commit -m "feat(citation-audit): h1-present check"
```

---

### Task 8: Check — `heading-hierarchy`

**Files:**
- Create: `src/lib/citation-audit/checks/heading-hierarchy.ts`, `.test.ts`

Heuristic: pass if heading levels never skip (e.g. h1 → h3 with no h2 in between is a skip). Score 100 / 50 (one skip) / 0 (multiple skips).

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { parsePage } from '../parse';
import { check } from './heading-hierarchy';

const ok = '<html><body><h1>A</h1><h2>B</h2><h3>C</h3></body></html>';
const oneSkip = '<html><body><h1>A</h1><h3>C</h3></body></html>';
const manySkips = '<html><body><h1>A</h1><h4>D</h4><h2>B</h2><h5>E</h5></body></html>';

describe('heading-hierarchy', () => {
  it('passes when no levels are skipped', () => {
    expect(check(parsePage('https://x', ok), { entityName: 'X' }).score).toBe(100);
  });
  it('partial credit for one skip', () => {
    const r = check(parsePage('https://x', oneSkip), { entityName: 'X' });
    expect(r.passed).toBe(false);
    expect(r.score).toBe(50);
    expect(r.recommendation).toMatch(/skip/);
  });
  it('fails for multiple skips', () => {
    expect(check(parsePage('https://x', manySkips), { entityName: 'X' }).score).toBe(0);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** Run: `pnpm test src/lib/citation-audit/checks/heading-hierarchy.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/lib/citation-audit/checks/heading-hierarchy.ts
import type { CheckResult, ParsedPage, CheckContext } from '../types';

export const ID = 'heading-hierarchy';
export const WEIGHT = 5;

export function check(parsed: ParsedPage, _ctx: CheckContext): CheckResult {
  let skips = 0;
  let prev = 0;
  for (const h of parsed.headings) {
    if (prev > 0 && h.level > prev + 1) skips++;
    prev = h.level;
  }
  if (skips === 0) {
    return { id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: [`${parsed.headings.length} headings, no skipped levels.`], recommendation: null };
  }
  if (skips === 1) {
    return { id: ID, weight: WEIGHT, passed: false, score: 50,
      evidence: ['One heading-level skip detected.'],
      recommendation: 'Avoid skipping heading levels (e.g., H1 directly to H3). Insert the missing level or demote the deeper heading.' };
  }
  return { id: ID, weight: WEIGHT, passed: false, score: 0,
    evidence: [`${skips} heading-level skips detected.`],
    recommendation: 'Restructure headings so each level is one deeper than the previous (H1 → H2 → H3).' };
}
```

- [ ] **Step 4: Run, expect PASS.** `pnpm test src/lib/citation-audit/checks/heading-hierarchy.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/citation-audit/checks/heading-hierarchy.ts src/lib/citation-audit/checks/heading-hierarchy.test.ts
git commit -m "feat(citation-audit): heading-hierarchy check"
```

---

### Task 9: Check — `meta-description`

Heuristic: pass when meta description present, length 120–160 chars. Partial credit (60) if present but outside range. 0 if absent.

- [ ] **Step 1: Test**

```ts
// src/lib/citation-audit/checks/meta-description.test.ts
import { describe, it, expect } from 'vitest';
import { parsePage } from '../parse';
import { check } from './meta-description';

const good = (desc: string) => `<html><head><meta name="description" content="${desc}"></head><body></body></html>`;
const optimal = good('x'.repeat(140));
const tooShort = good('Brief.');
const tooLong = good('y'.repeat(200));
const missing = '<html><head></head><body></body></html>';

describe('meta-description', () => {
  it('100 when 120-160 chars', () => expect(check(parsePage('https://x', optimal), { entityName: 'X' }).score).toBe(100));
  it('60 when present but short', () => {
    const r = check(parsePage('https://x', tooShort), { entityName: 'X' });
    expect(r.score).toBe(60);
    expect(r.recommendation).toMatch(/120-160/);
  });
  it('60 when present but long', () => expect(check(parsePage('https://x', tooLong), { entityName: 'X' }).score).toBe(60));
  it('0 when missing', () => {
    const r = check(parsePage('https://x', missing), { entityName: 'X' });
    expect(r.score).toBe(0);
    expect(r.recommendation).toMatch(/Add a meta description/);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** `pnpm test src/lib/citation-audit/checks/meta-description.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/lib/citation-audit/checks/meta-description.ts
import type { CheckResult, ParsedPage, CheckContext } from '../types';

export const ID = 'meta-description';
export const WEIGHT = 5;

export function check(parsed: ParsedPage, _ctx: CheckContext): CheckResult {
  const desc = parsed.metaDescription;
  if (!desc || !desc.trim()) {
    return { id: ID, weight: WEIGHT, passed: false, score: 0,
      evidence: ['No <meta name="description"> tag.'],
      recommendation: 'Add a meta description summarizing the page in 120-160 characters.' };
  }
  const len = desc.trim().length;
  if (len >= 120 && len <= 160) {
    return { id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: [`Meta description present (${len} chars).`], recommendation: null };
  }
  return { id: ID, weight: WEIGHT, passed: false, score: 60,
    evidence: [`Meta description present but ${len} chars (target: 120-160).`],
    recommendation: `Resize the meta description to 120-160 characters (currently ${len}).` };
}
```

- [ ] **Step 4: Run, expect PASS.** `pnpm test src/lib/citation-audit/checks/meta-description.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/citation-audit/checks/meta-description.ts src/lib/citation-audit/checks/meta-description.test.ts
git commit -m "feat(citation-audit): meta-description check"
```

---

### Task 10: Check — `canonical`

Heuristic: pass when a `<link rel="canonical">` is present. 100 / 0.

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { parsePage } from '../parse';
import { check } from './canonical';

const ok = '<html><head><link rel="canonical" href="https://x/p"></head></html>';
const missing = '<html><head></head></html>';

describe('canonical', () => {
  it('100 when present', () => expect(check(parsePage('https://x', ok), { entityName: 'X' }).score).toBe(100));
  it('0 when missing', () => {
    const r = check(parsePage('https://x', missing), { entityName: 'X' });
    expect(r.score).toBe(0);
    expect(r.recommendation).toMatch(/canonical/);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** `pnpm test src/lib/citation-audit/checks/canonical.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/lib/citation-audit/checks/canonical.ts
import type { CheckResult, ParsedPage, CheckContext } from '../types';
export const ID = 'canonical';
export const WEIGHT = 3;
export function check(parsed: ParsedPage, _ctx: CheckContext): CheckResult {
  if (parsed.canonical) {
    return { id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: [`Canonical URL: ${parsed.canonical}`], recommendation: null };
  }
  return { id: ID, weight: WEIGHT, passed: false, score: 0,
    evidence: ['No canonical link element.'],
    recommendation: 'Add <link rel="canonical" href="..."> to declare the preferred URL for this page.' };
}
```

- [ ] **Step 4: Run, expect PASS.** `pnpm test src/lib/citation-audit/checks/canonical.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/citation-audit/checks/canonical.ts src/lib/citation-audit/checks/canonical.test.ts
git commit -m "feat(citation-audit): canonical check"
```

---

### Task 11: Check — `schema-type`

Heuristic: pass when at least one JSON-LD block declares an `@type` in the recommended set: `Article`, `BlogPosting`, `NewsArticle`, `FAQPage`, `Product`, `Service`, `Organization`, `AboutPage`, `WebSite`. A generic `WebPage` alone is partial (50). No JSON-LD: 0.

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { parsePage } from '../parse';
import { check } from './schema-type';

const article = `<html><head><script type="application/ld+json">{"@type":"Article","headline":"A"}</script></head></html>`;
const justWebPage = `<html><head><script type="application/ld+json">{"@type":"WebPage"}</script></head></html>`;
const none = `<html><head></head></html>`;

describe('schema-type', () => {
  it('100 for an article', () => expect(check(parsePage('https://x', article), { entityName: 'X' }).score).toBe(100));
  it('50 for plain WebPage only', () => {
    const r = check(parsePage('https://x', justWebPage), { entityName: 'X' });
    expect(r.score).toBe(50);
    expect(r.recommendation).toMatch(/specific/);
  });
  it('0 when no JSON-LD', () => expect(check(parsePage('https://x', none), { entityName: 'X' }).score).toBe(0));
});
```

- [ ] **Step 2: Run, expect FAIL.** `pnpm test src/lib/citation-audit/checks/schema-type.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/lib/citation-audit/checks/schema-type.ts
import type { CheckResult, ParsedPage, CheckContext } from '../types';

export const ID = 'schema-type';
export const WEIGHT = 10;

const RECOMMENDED = new Set([
  'Article','BlogPosting','NewsArticle','FAQPage','Product','Service','Organization','AboutPage','WebSite',
]);

function typesOf(block: Record<string, unknown>): string[] {
  const t = block['@type'];
  if (Array.isArray(t)) return t.map(String);
  if (typeof t === 'string') return [t];
  return [];
}

export function check(parsed: ParsedPage, _ctx: CheckContext): CheckResult {
  if (parsed.jsonLd.length === 0) {
    return { id: ID, weight: WEIGHT, passed: false, score: 0,
      evidence: ['No JSON-LD blocks on page.'],
      recommendation: 'Add a JSON-LD <script type="application/ld+json"> block declaring an @type appropriate for this page (Article, Service, Product, FAQPage, etc.).' };
  }
  const allTypes = parsed.jsonLd.flatMap((b) => typesOf(b as Record<string, unknown>));
  const recommended = allTypes.filter((t) => RECOMMENDED.has(t));
  if (recommended.length > 0) {
    return { id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: [`Found Schema.org type(s): ${recommended.join(', ')}`], recommendation: null };
  }
  const hasWebPage = allTypes.includes('WebPage');
  if (hasWebPage) {
    return { id: ID, weight: WEIGHT, passed: false, score: 50,
      evidence: ['Only generic WebPage type declared.'],
      recommendation: 'Replace or supplement WebPage with a more specific @type (Article, Service, Product, FAQPage, AboutPage).' };
  }
  return { id: ID, weight: WEIGHT, passed: false, score: 0,
    evidence: [`Unrecognized @type(s): ${allTypes.join(', ') || '(none)'}`],
    recommendation: 'Declare a Schema.org @type appropriate for this page (Article, Service, Product, FAQPage, AboutPage).' };
}
```

- [ ] **Step 4: Run, expect PASS.** `pnpm test src/lib/citation-audit/checks/schema-type.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/citation-audit/checks/schema-type.ts src/lib/citation-audit/checks/schema-type.test.ts
git commit -m "feat(citation-audit): schema-type check"
```

---

### Task 12: Check — `schema-fields`

Heuristic: per recommended schema type, check required fields are present. Pass if all required fields for the detected type exist; partial if some; 0 if none / no schema. Required-field map:
- `Article` / `BlogPosting` / `NewsArticle`: `headline`, `datePublished`, `author`
- `Product`: `name`, `description`, `offers` or `aggregateRating`
- `Service`: `name`, `provider`
- `FAQPage`: `mainEntity`
- `Organization`: `name`, `url`
- `AboutPage`: `name`
- `WebSite`: `name`, `url`

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { parsePage } from '../parse';
import { check } from './schema-fields';

const completeArticle = `<html><head><script type="application/ld+json">
  {"@type":"Article","headline":"H","datePublished":"2026-01-01","author":{"@type":"Person","name":"X"}}
</script></head></html>`;

const partialArticle = `<html><head><script type="application/ld+json">
  {"@type":"Article","headline":"H"}
</script></head></html>`;

const noSchema = `<html><head></head></html>`;

describe('schema-fields', () => {
  it('100 when all required fields present', () => {
    expect(check(parsePage('https://x', completeArticle), { entityName: 'X' }).score).toBe(100);
  });
  it('partial when some required fields missing', () => {
    const r = check(parsePage('https://x', partialArticle), { entityName: 'X' });
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(100);
    expect(r.recommendation).toMatch(/datePublished|author/);
  });
  it('0 when no schema', () => {
    expect(check(parsePage('https://x', noSchema), { entityName: 'X' }).score).toBe(0);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** `pnpm test src/lib/citation-audit/checks/schema-fields.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/lib/citation-audit/checks/schema-fields.ts
import type { CheckResult, ParsedPage, CheckContext } from '../types';

export const ID = 'schema-fields';
export const WEIGHT = 5;

const REQUIRED: Record<string, string[]> = {
  Article: ['headline', 'datePublished', 'author'],
  BlogPosting: ['headline', 'datePublished', 'author'],
  NewsArticle: ['headline', 'datePublished', 'author'],
  Product: ['name', 'description'],
  Service: ['name', 'provider'],
  FAQPage: ['mainEntity'],
  Organization: ['name', 'url'],
  AboutPage: ['name'],
  WebSite: ['name', 'url'],
};

function typesOf(b: Record<string, unknown>): string[] {
  const t = b['@type'];
  return Array.isArray(t) ? t.map(String) : typeof t === 'string' ? [t] : [];
}

export function check(parsed: ParsedPage, _ctx: CheckContext): CheckResult {
  if (parsed.jsonLd.length === 0) {
    return { id: ID, weight: WEIGHT, passed: false, score: 0,
      evidence: ['No JSON-LD blocks; required-field check skipped.'],
      recommendation: 'Once a Schema.org @type is declared, include required fields for that type.' };
  }
  // Examine the first JSON-LD block that matches a known type.
  for (const block of parsed.jsonLd as Record<string, unknown>[]) {
    for (const t of typesOf(block)) {
      const required = REQUIRED[t];
      if (!required) continue;
      const present = required.filter((f) => block[f] != null);
      const missing = required.filter((f) => block[f] == null);
      if (missing.length === 0) {
        return { id: ID, weight: WEIGHT, passed: true, score: 100,
          evidence: [`All required ${t} fields present: ${present.join(', ')}.`], recommendation: null };
      }
      const score = Math.round((present.length / required.length) * 100);
      return { id: ID, weight: WEIGHT, passed: false, score,
        evidence: [`${t} schema missing fields: ${missing.join(', ')}.`],
        recommendation: `Add the following fields to your ${t} JSON-LD: ${missing.join(', ')}.` };
    }
  }
  return { id: ID, weight: WEIGHT, passed: false, score: 0,
    evidence: ['No recognized Schema.org type in JSON-LD.'],
    recommendation: 'Use a recognized @type and include its required fields.' };
}
```

- [ ] **Step 4: Run, expect PASS.** `pnpm test src/lib/citation-audit/checks/schema-fields.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/citation-audit/checks/schema-fields.ts src/lib/citation-audit/checks/schema-fields.test.ts
git commit -m "feat(citation-audit): schema-fields check"
```

---

### Task 13: Check — `answer-position`

Heuristic: extract the first 100 words of the Readability article text (fallback: body text). Pass (100) if both the entity name AND a summary sentence (declarative sentence ending in `.`) appear. Partial (50) if only one. 0 if neither.

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { parsePage } from '../parse';
import { check } from './answer-position';

const ok = `<html><body><h1>AI Services</h1><p>Example Co helps mid-market companies adopt AI without the hype. We run discovery workshops, build roadmaps, and partner long-term.</p></body></html>`;
const noEntity = `<html><body><h1>AI Services</h1><p>We help companies adopt AI without the hype. We run workshops and build roadmaps.</p></body></html>`;
const empty = `<html><body><h1>AI</h1></body></html>`;

describe('answer-position', () => {
  it('100 when entity name + summary sentence in first 100 words', () => {
    expect(check(parsePage('https://x', ok), { entityName: 'Example Co' }).score).toBe(100);
  });
  it('partial when summary present but entity missing', () => {
    const r = check(parsePage('https://x', noEntity), { entityName: 'Example Co' });
    expect(r.score).toBe(50);
    expect(r.recommendation).toMatch(/Example Co/);
  });
  it('0 when first 100 words empty/missing', () => {
    expect(check(parsePage('https://x', empty), { entityName: 'Example Co' }).score).toBe(0);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** `pnpm test src/lib/citation-audit/checks/answer-position.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/lib/citation-audit/checks/answer-position.ts
import type { CheckResult, ParsedPage, CheckContext } from '../types';

export const ID = 'answer-position';
export const WEIGHT = 15;

function firstNWords(text: string, n: number): string {
  return text.split(/\s+/).filter(Boolean).slice(0, n).join(' ');
}

export function check(parsed: ParsedPage, ctx: CheckContext): CheckResult {
  const body = parsed.article?.textContent ?? parsed.document.body?.textContent ?? '';
  const opening = firstNWords(body, 100);
  if (!opening) {
    return { id: ID, weight: WEIGHT, passed: false, score: 0,
      evidence: ['Page has no readable body text.'],
      recommendation: `Add a short opening paragraph that names "${ctx.entityName}" and summarizes the page in 1-2 sentences.` };
  }
  const hasEntity = ctx.entityName.length > 0 &&
    opening.toLowerCase().includes(ctx.entityName.toLowerCase());
  const hasSummary = /[.!?]/.test(opening);

  if (hasEntity && hasSummary) {
    return { id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: [`First 100 words contain entity "${ctx.entityName}" and a summary sentence.`],
      recommendation: null };
  }
  if (hasSummary || hasEntity) {
    const missing = !hasEntity ? `the entity name "${ctx.entityName}"` : 'a summary sentence';
    return { id: ID, weight: WEIGHT, passed: false, score: 50,
      evidence: [`First 100 words missing ${missing}.`],
      recommendation: `Add ${missing} to the opening paragraph (within the first 100 words).` };
  }
  return { id: ID, weight: WEIGHT, passed: false, score: 0,
    evidence: ['Opening paragraph lacks both entity name and summary sentence.'],
    recommendation: `Rewrite the opening so the first 1-2 sentences name "${ctx.entityName}" and state what the page is about.` };
}
```

- [ ] **Step 4: Run, expect PASS.** `pnpm test src/lib/citation-audit/checks/answer-position.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/citation-audit/checks/answer-position.ts src/lib/citation-audit/checks/answer-position.test.ts
git commit -m "feat(citation-audit): answer-position check"
```

---

### Task 14: Check — `entity-first-paragraph`

Heuristic: extract the first `<p>` in the Readability article (or first body `<p>` fallback). Pass (100) if entity name appears. 0 otherwise.

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { parsePage } from '../parse';
import { check } from './entity-first-paragraph';

const ok = '<html><body><p>Example Co is a strategy firm.</p></body></html>';
const later = '<html><body><p>We are a strategy firm.</p><p>Example Co was founded in 2020.</p></body></html>';
const none = '<html><body></body></html>';

describe('entity-first-paragraph', () => {
  it('100 when entity in first paragraph', () =>
    expect(check(parsePage('https://x', ok), { entityName: 'Example Co' }).score).toBe(100));
  it('0 when entity only appears in later paragraph', () =>
    expect(check(parsePage('https://x', later), { entityName: 'Example Co' }).score).toBe(0));
  it('0 when no paragraphs', () =>
    expect(check(parsePage('https://x', none), { entityName: 'Example Co' }).score).toBe(0));
});
```

- [ ] **Step 2: Run, expect FAIL.** `pnpm test src/lib/citation-audit/checks/entity-first-paragraph.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/lib/citation-audit/checks/entity-first-paragraph.ts
import type { CheckResult, ParsedPage, CheckContext } from '../types';
export const ID = 'entity-first-paragraph';
export const WEIGHT = 8;

export function check(parsed: ParsedPage, ctx: CheckContext): CheckResult {
  const firstP = parsed.document.querySelector('p')?.textContent?.trim() ?? '';
  if (!firstP) {
    return { id: ID, weight: WEIGHT, passed: false, score: 0,
      evidence: ['No paragraph elements found.'],
      recommendation: `Add an opening paragraph that names "${ctx.entityName}".` };
  }
  if (firstP.toLowerCase().includes(ctx.entityName.toLowerCase())) {
    return { id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: [`First paragraph names "${ctx.entityName}".`], recommendation: null };
  }
  return { id: ID, weight: WEIGHT, passed: false, score: 0,
    evidence: [`First paragraph: "${firstP.slice(0, 120)}${firstP.length > 120 ? '…' : ''}"`],
    recommendation: `Rewrite the first paragraph to include "${ctx.entityName}".` };
}
```

- [ ] **Step 4: Run, expect PASS.** `pnpm test src/lib/citation-audit/checks/entity-first-paragraph.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/citation-audit/checks/entity-first-paragraph.ts src/lib/citation-audit/checks/entity-first-paragraph.test.ts
git commit -m "feat(citation-audit): entity-first-paragraph check"
```

---

### Task 15: Check — `question-h2s`

Heuristic: an H2 is "question-style" if its text ends with `?` OR begins with one of `what|when|where|who|why|how|is|are|do|does|can|should`. Pass (100) if ≥2 question-style H2s. Partial (50) if exactly 1. 0 otherwise.

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { parsePage } from '../parse';
import { check } from './question-h2s';

const two = '<html><body><h2>What does this do?</h2><h2>How does pricing work</h2></body></html>';
const one = '<html><body><h2>What is AI?</h2><h2>Pricing</h2></body></html>';
const none = '<html><body><h2>Features</h2><h2>Pricing</h2></body></html>';

describe('question-h2s', () => {
  it('100 when >=2 question-style H2s', () => expect(check(parsePage('https://x', two), { entityName: 'X' }).score).toBe(100));
  it('50 when exactly 1', () => expect(check(parsePage('https://x', one), { entityName: 'X' }).score).toBe(50));
  it('0 when none', () => expect(check(parsePage('https://x', none), { entityName: 'X' }).score).toBe(0));
});
```

- [ ] **Step 2: Run, expect FAIL.** `pnpm test src/lib/citation-audit/checks/question-h2s.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/lib/citation-audit/checks/question-h2s.ts
import type { CheckResult, ParsedPage, CheckContext } from '../types';

export const ID = 'question-h2s';
export const WEIGHT = 7;
const STARTERS = /^(what|when|where|who|why|how|is|are|do|does|can|should)\b/i;

function isQuestion(s: string): boolean {
  const t = s.trim();
  return t.endsWith('?') || STARTERS.test(t);
}

export function check(parsed: ParsedPage, _ctx: CheckContext): CheckResult {
  const h2s = parsed.headings.filter((h) => h.level === 2);
  const qs = h2s.filter((h) => isQuestion(h.text));
  if (qs.length >= 2) {
    return { id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: [`${qs.length} question-style H2s: ${qs.map((q) => `"${q.text}"`).join(', ')}`],
      recommendation: null };
  }
  if (qs.length === 1) {
    return { id: ID, weight: WEIGHT, passed: false, score: 50,
      evidence: ['Only 1 question-style H2.'],
      recommendation: 'Add at least one more H2 phrased as a question users actually ask (e.g., "How does this work?").' };
  }
  return { id: ID, weight: WEIGHT, passed: false, score: 0,
    evidence: [`${h2s.length} H2 headings, none phrased as questions.`],
    recommendation: 'Rewrite 2+ H2 headings as questions a user might ask ("What is X?", "How does X work?").' };
}
```

- [ ] **Step 4: Run, expect PASS.** `pnpm test src/lib/citation-audit/checks/question-h2s.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/citation-audit/checks/question-h2s.ts src/lib/citation-audit/checks/question-h2s.test.ts
git commit -m "feat(citation-audit): question-h2s check"
```

---

### Task 16: Check — `lists-tables`

Heuristic: pass if at least one `<ul>`, `<ol>`, or `<table>` is in the body. 100 / 0.

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { parsePage } from '../parse';
import { check } from './lists-tables';

const ul = '<html><body><ul><li>a</li></ul></body></html>';
const table = '<html><body><table><tr><td>x</td></tr></table></body></html>';
const none = '<html><body><p>plain</p></body></html>';

describe('lists-tables', () => {
  it('100 with ul', () => expect(check(parsePage('https://x', ul), { entityName: 'X' }).score).toBe(100));
  it('100 with table', () => expect(check(parsePage('https://x', table), { entityName: 'X' }).score).toBe(100));
  it('0 with neither', () => expect(check(parsePage('https://x', none), { entityName: 'X' }).score).toBe(0));
});
```

- [ ] **Step 2: Run, expect FAIL.** `pnpm test src/lib/citation-audit/checks/lists-tables.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/lib/citation-audit/checks/lists-tables.ts
import type { CheckResult, ParsedPage, CheckContext } from '../types';
export const ID = 'lists-tables';
export const WEIGHT = 5;
export function check(parsed: ParsedPage, _ctx: CheckContext): CheckResult {
  const lists = parsed.document.querySelectorAll('ul, ol').length;
  const tables = parsed.document.querySelectorAll('table').length;
  if (lists + tables > 0) {
    return { id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: [`Found ${lists} list(s) and ${tables} table(s).`], recommendation: null };
  }
  return { id: ID, weight: WEIGHT, passed: false, score: 0,
    evidence: ['No lists or tables on the page.'],
    recommendation: 'Add a bulleted list or comparison table where the page covers multiple options, steps, or features.' };
}
```

- [ ] **Step 4: Run, expect PASS.** `pnpm test src/lib/citation-audit/checks/lists-tables.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/citation-audit/checks/lists-tables.ts src/lib/citation-audit/checks/lists-tables.test.ts
git commit -m "feat(citation-audit): lists-tables check"
```

---

### Task 17: Check — `definitions`

Heuristic: in the first paragraph (article body fallback), detect a "X is Y" pattern via simple regex `\b[A-Z][\w-]+ (is|means|refers to) \b`. Pass (100) if matched. 0 otherwise. Pure regex; no `compromise` needed for v1.

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { parsePage } from '../parse';
import { check } from './definitions';

const ok = '<html><body><p>Example Co is a strategy firm focused on AI.</p></body></html>';
const fail = '<html><body><p>We help companies do things.</p></body></html>';
const none = '<html><body></body></html>';

describe('definitions', () => {
  it('100 when definition pattern present', () =>
    expect(check(parsePage('https://x', ok), { entityName: 'Example Co' }).score).toBe(100));
  it('0 when no definition', () =>
    expect(check(parsePage('https://x', fail), { entityName: 'Example Co' }).score).toBe(0));
  it('0 when no text', () =>
    expect(check(parsePage('https://x', none), { entityName: 'Example Co' }).score).toBe(0));
});
```

- [ ] **Step 2: Run, expect FAIL.** `pnpm test src/lib/citation-audit/checks/definitions.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/lib/citation-audit/checks/definitions.ts
import type { CheckResult, ParsedPage, CheckContext } from '../types';
export const ID = 'definitions';
export const WEIGHT = 5;

const PATTERN = /\b[A-Z][\w-]+(?:\s+[A-Z][\w-]+)*\s+(is|means|refers to)\s+/;

export function check(parsed: ParsedPage, _ctx: CheckContext): CheckResult {
  const firstP = parsed.document.querySelector('p')?.textContent ?? parsed.article?.textContent ?? '';
  if (!firstP.trim()) {
    return { id: ID, weight: WEIGHT, passed: false, score: 0,
      evidence: ['No opening paragraph text.'],
      recommendation: 'Add an opening sentence that defines the topic in "X is Y" form.' };
  }
  const match = firstP.match(PATTERN);
  if (match) {
    return { id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: [`Definition pattern: "${match[0].trim()}..."`], recommendation: null };
  }
  return { id: ID, weight: WEIGHT, passed: false, score: 0,
    evidence: [`Opening paragraph lacks a definition pattern.`],
    recommendation: 'Open the page with a sentence in the form "X is Y" so LLMs can extract a clean definition.' };
}
```

- [ ] **Step 4: Run, expect PASS.** `pnpm test src/lib/citation-audit/checks/definitions.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/citation-audit/checks/definitions.ts src/lib/citation-audit/checks/definitions.test.ts
git commit -m "feat(citation-audit): definitions check"
```

---

### Task 18: Check — `freshness`

Heuristic: find `dateModified` in JSON-LD; fallback to `<meta property="article:modified_time">`. Pass (100) if within 18 months. Partial (50) if 18–36 months. 0 if older or missing.

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { parsePage } from '../parse';
import { check } from './freshness';

const recent = (iso: string) => `<html><head><script type="application/ld+json">{"@type":"Article","dateModified":"${iso}"}</script></head></html>`;
const noDate = '<html><head></head></html>';

const now = new Date('2026-05-19T00:00:00Z');
const tenMonthsAgo = '2025-07-19T00:00:00Z';
const twoYearsAgo = '2024-05-19T00:00:00Z';
const fiveYearsAgo = '2021-05-19T00:00:00Z';

describe('freshness', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); });
  afterEach(() => { vi.useRealTimers(); });

  it('100 within 18 months', () => expect(check(parsePage('https://x', recent(tenMonthsAgo)), { entityName: 'X' }).score).toBe(100));
  it('50 between 18 and 36 months', () => expect(check(parsePage('https://x', recent(twoYearsAgo)), { entityName: 'X' }).score).toBe(50));
  it('0 older than 36 months', () => expect(check(parsePage('https://x', recent(fiveYearsAgo)), { entityName: 'X' }).score).toBe(0));
  it('0 when no date', () => expect(check(parsePage('https://x', noDate), { entityName: 'X' }).score).toBe(0));
});
```

Add: `import { beforeEach, afterEach, vi } from 'vitest';` at top.

- [ ] **Step 2: Run, expect FAIL.** `pnpm test src/lib/citation-audit/checks/freshness.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/lib/citation-audit/checks/freshness.ts
import type { CheckResult, ParsedPage, CheckContext } from '../types';
import * as chrono from 'chrono-node';

export const ID = 'freshness';
export const WEIGHT = 8;

function pickDate(parsed: ParsedPage): Date | null {
  for (const b of parsed.jsonLd as Array<Record<string, unknown>>) {
    const dm = b['dateModified'] ?? b['datePublished'];
    if (typeof dm === 'string') {
      const d = new Date(dm);
      if (!isNaN(d.getTime())) return d;
    }
  }
  const meta = parsed.meta.find((m) => m.property === 'article:modified_time' || m.property === 'article:published_time');
  if (meta) {
    const d = new Date(meta.content);
    if (!isNaN(d.getTime())) return d;
  }
  // Last resort: chrono on body text (first occurrence)
  const body = parsed.article?.textContent ?? '';
  const refs = chrono.parse(body);
  if (refs.length > 0) return refs[0].start.date();
  return null;
}

export function check(parsed: ParsedPage, _ctx: CheckContext): CheckResult {
  const date = pickDate(parsed);
  if (!date) {
    return { id: ID, weight: WEIGHT, passed: false, score: 0,
      evidence: ['No dateModified, datePublished, or recognizable date on page.'],
      recommendation: 'Add `dateModified` to your JSON-LD or an `article:modified_time` meta tag.' };
  }
  const monthsAgo = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  if (monthsAgo <= 18) {
    return { id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: [`Last updated ${Math.round(monthsAgo)} month(s) ago.`], recommendation: null };
  }
  if (monthsAgo <= 36) {
    return { id: ID, weight: WEIGHT, passed: false, score: 50,
      evidence: [`Last updated ${Math.round(monthsAgo)} months ago.`],
      recommendation: 'Refresh this page and bump its dateModified — AI engines down-rank stale content.' };
  }
  return { id: ID, weight: WEIGHT, passed: false, score: 0,
    evidence: [`Last updated ${Math.round(monthsAgo)} months ago.`],
    recommendation: 'Substantially update this page and refresh its dateModified.' };
}
```

- [ ] **Step 4: Run, expect PASS.** `pnpm test src/lib/citation-audit/checks/freshness.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/citation-audit/checks/freshness.ts src/lib/citation-audit/checks/freshness.test.ts
git commit -m "feat(citation-audit): freshness check"
```

---

### Task 19: Check — `readability`

Heuristic: Flesch–Kincaid grade level via `text-readability` on the Readability article text. Pass (100) if grade 8–10. Partial (60) if 6–7 or 11–13. 0 if outside that range or no text.

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { parsePage } from '../parse';
import { check } from './readability';

// Grade ~9: medium-length declarative sentences.
const medium = `<html><body><article><p>Customer experience teams need clarity. ${
  Array(20).fill('We measure user time on each step and look for patterns.').join(' ')
}</p></article></body></html>`;

const empty = '<html><body></body></html>';

describe('readability', () => {
  it('100 for medium-grade prose', () => {
    const r = check(parsePage('https://x', medium), { entityName: 'X' });
    expect(r.score).toBeGreaterThanOrEqual(60);   // depends on FK exactly; assert ≥60
  });
  it('0 when no body text', () =>
    expect(check(parsePage('https://x', empty), { entityName: 'X' }).score).toBe(0));
});
```

Note: text-readability's FK calculation is library-internal. Assert ≥60 for the medium prose rather than exact 100; the implementation will set thresholds.

- [ ] **Step 2: Run, expect FAIL.** `pnpm test src/lib/citation-audit/checks/readability.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/lib/citation-audit/checks/readability.ts
import type { CheckResult, ParsedPage, CheckContext } from '../types';
import rs from 'text-readability';

export const ID = 'readability';
export const WEIGHT = 5;

export function check(parsed: ParsedPage, _ctx: CheckContext): CheckResult {
  const text = parsed.article?.textContent ?? parsed.document.body?.textContent ?? '';
  if (text.trim().length < 100) {
    return { id: ID, weight: WEIGHT, passed: false, score: 0,
      evidence: ['Insufficient body text for readability scoring.'],
      recommendation: 'Add at least a few paragraphs of substantive content.' };
  }
  const grade = rs.fleschKincaidGrade(text);
  if (grade >= 8 && grade <= 10) {
    return { id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: [`Flesch–Kincaid grade ${grade.toFixed(1)} (target 8-10).`], recommendation: null };
  }
  if ((grade >= 6 && grade < 8) || (grade > 10 && grade <= 13)) {
    return { id: ID, weight: WEIGHT, passed: false, score: 60,
      evidence: [`Flesch–Kincaid grade ${grade.toFixed(1)} (target 8-10).`],
      recommendation: grade < 8
        ? 'Add precision; current prose may be too simple for the audience.'
        : 'Simplify sentence length and word choice. Aim for grade 8-10.' };
  }
  return { id: ID, weight: WEIGHT, passed: false, score: 0,
    evidence: [`Flesch–Kincaid grade ${grade.toFixed(1)} is outside the target range.`],
    recommendation: 'Rewrite for grade level 8-10 — short, declarative sentences with concrete nouns.' };
}
```

- [ ] **Step 4: Run, expect PASS.** `pnpm test src/lib/citation-audit/checks/readability.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/citation-audit/checks/readability.ts src/lib/citation-audit/checks/readability.test.ts
git commit -m "feat(citation-audit): readability check"
```

---

### Task 20: Check — `named-entities`

Heuristic: use `compromise` to extract named entities (people, places, organizations). Pass (100) if ≥3 unique entities found AND at least one has a disambiguation signal (link to Wikipedia/Wikidata, schema.org `sameAs` URL, or appears as a key in JSON-LD). Partial (60) if ≥3 entities but no disambiguation. 0 if <3.

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { parsePage } from '../parse';
import { check } from './named-entities';

const disambiguated = `<html><body>
<p>Example Co works with Google and Microsoft in San Francisco.</p>
<script type="application/ld+json">{"@type":"Organization","name":"Example Co","sameAs":"https://en.wikipedia.org/wiki/Example_Co"}</script>
</body></html>`;

const undisambiguated = '<html><body><p>Example Co works with Acme and Foo Bar in Cleveland.</p></body></html>';
const few = '<html><body><p>We help companies do things.</p></body></html>';

describe('named-entities', () => {
  it('100 when entities + disambiguation', () => {
    const r = check(parsePage('https://x', disambiguated), { entityName: 'Example Co' });
    expect(r.score).toBe(100);
  });
  it('60 when entities but no disambiguation', () => {
    const r = check(parsePage('https://x', undisambiguated), { entityName: 'Example Co' });
    expect(r.score).toBe(60);
  });
  it('0 with too few entities', () => {
    expect(check(parsePage('https://x', few), { entityName: 'Example Co' }).score).toBe(0);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** `pnpm test src/lib/citation-audit/checks/named-entities.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/lib/citation-audit/checks/named-entities.ts
import type { CheckResult, ParsedPage, CheckContext } from '../types';
import nlp from 'compromise';

export const ID = 'named-entities';
export const WEIGHT = 9;

function extract(text: string): string[] {
  const doc = nlp(text);
  const orgs: string[] = doc.organizations().out('array');
  const people: string[] = doc.people().out('array');
  const places: string[] = doc.places().out('array');
  return Array.from(new Set([...orgs, ...people, ...places].map((s) => s.trim()).filter(Boolean)));
}

function hasDisambiguation(parsed: ParsedPage): boolean {
  for (const b of parsed.jsonLd as Array<Record<string, unknown>>) {
    if (typeof b['sameAs'] === 'string' && /wikipedia|wikidata/.test(b['sameAs'] as string)) return true;
    if (Array.isArray(b['sameAs']) && (b['sameAs'] as string[]).some((s) => /wikipedia|wikidata/.test(s))) return true;
  }
  return parsed.links.some((l) => /wikipedia\.org|wikidata\.org/.test(l.href));
}

export function check(parsed: ParsedPage, _ctx: CheckContext): CheckResult {
  const body = parsed.article?.textContent ?? parsed.document.body?.textContent ?? '';
  const entities = extract(body);
  if (entities.length < 3) {
    return { id: ID, weight: WEIGHT, passed: false, score: 0,
      evidence: [`Found ${entities.length} named entities (target ≥3).`],
      recommendation: 'Name the specific organizations, products, or people relevant to the topic so LLMs can disambiguate.' };
  }
  if (hasDisambiguation(parsed)) {
    return { id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: [`Entities: ${entities.slice(0, 5).join(', ')}. Disambiguation via Wikipedia/Wikidata link found.`],
      recommendation: null };
  }
  return { id: ID, weight: WEIGHT, passed: false, score: 60,
    evidence: [`Entities: ${entities.slice(0, 5).join(', ')}. No disambiguation links.`],
    recommendation: 'Add `sameAs` Wikipedia/Wikidata links in your JSON-LD or hyperlink at least one entity to its authoritative page.' };
}
```

- [ ] **Step 4: Run, expect PASS.** `pnpm test src/lib/citation-audit/checks/named-entities.test.ts`
  - Note: `compromise`'s entity extraction is heuristic. If your specific fixtures don't extract 3 entities, adjust the fixture text rather than the threshold.

- [ ] **Step 5: Commit**

```bash
git add src/lib/citation-audit/checks/named-entities.ts src/lib/citation-audit/checks/named-entities.test.ts
git commit -m "feat(citation-audit): named-entities check"
```

---

### Task 21: Check — `internal-links`

Heuristic: count same-host outbound links (non-self). Pass (100) if ≥3. Partial (60) if 1–2. 0 if 0.

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { parsePage } from '../parse';
import { check } from './internal-links';

const many = '<html><body><a href="https://x.com/a">A</a><a href="https://x.com/b">B</a><a href="https://x.com/c">C</a></body></html>';
const one = '<html><body><a href="https://x.com/a">A</a><a href="https://google.com">G</a></body></html>';
const none = '<html><body><a href="https://google.com">G</a></body></html>';

describe('internal-links', () => {
  it('100 when ≥3 internal', () => expect(check(parsePage('https://x.com/here', many), { entityName: 'X' }).score).toBe(100));
  it('60 when 1-2', () => expect(check(parsePage('https://x.com/here', one), { entityName: 'X' }).score).toBe(60));
  it('0 when none', () => expect(check(parsePage('https://x.com/here', none), { entityName: 'X' }).score).toBe(0));
});
```

- [ ] **Step 2: Run, expect FAIL.** `pnpm test src/lib/citation-audit/checks/internal-links.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/lib/citation-audit/checks/internal-links.ts
import type { CheckResult, ParsedPage, CheckContext } from '../types';
export const ID = 'internal-links';
export const WEIGHT = 5;

export function check(parsed: ParsedPage, _ctx: CheckContext): CheckResult {
  const internal = parsed.links.filter((l) => l.isInternal && !l.href.startsWith(parsed.url + '#') && l.href !== parsed.url);
  if (internal.length >= 3) {
    return { id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: [`${internal.length} internal links.`], recommendation: null };
  }
  if (internal.length > 0) {
    return { id: ID, weight: WEIGHT, passed: false, score: 60,
      evidence: [`Only ${internal.length} internal link(s).`],
      recommendation: 'Link to at least 3 related pages on this site to signal topic-cluster relevance.' };
  }
  return { id: ID, weight: WEIGHT, passed: false, score: 0,
    evidence: ['No internal links found.'],
    recommendation: 'Add internal links to related pages so AI engines can map the topic cluster.' };
}
```

- [ ] **Step 4: Run, expect PASS.** `pnpm test src/lib/citation-audit/checks/internal-links.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/citation-audit/checks/internal-links.ts src/lib/citation-audit/checks/internal-links.test.ts
git commit -m "feat(citation-audit): internal-links check"
```

---

### Task 22: Checks registry

**Files:**
- Create: `src/lib/citation-audit/checks/index.ts`

- [ ] **Step 1: Write the registry**

```ts
// src/lib/citation-audit/checks/index.ts
import type { CheckModule } from '../types';
import * as h1Present from './h1-present';
import * as headingHierarchy from './heading-hierarchy';
import * as metaDescription from './meta-description';
import * as canonical from './canonical';
import * as schemaType from './schema-type';
import * as schemaFields from './schema-fields';
import * as answerPosition from './answer-position';
import * as entityFirstParagraph from './entity-first-paragraph';
import * as questionH2s from './question-h2s';
import * as listsTables from './lists-tables';
import * as definitions from './definitions';
import * as freshness from './freshness';
import * as readability from './readability';
import * as namedEntities from './named-entities';
import * as internalLinks from './internal-links';

export const CHECKS: readonly CheckModule[] = [
  h1Present, headingHierarchy, metaDescription, canonical,
  schemaType, schemaFields, answerPosition, entityFirstParagraph,
  questionH2s, listsTables, definitions, freshness,
  readability, namedEntities, internalLinks,
] as const;
```

- [ ] **Step 2: Quick smoke test**

Run: `pnpm exec tsc --noEmit`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/citation-audit/checks/index.ts
git commit -m "feat(citation-audit): checks registry"
```

---

### Task 23: `auditPage` engine entry

**Files:**
- Create: `src/lib/citation-audit/audit-page.ts`, `src/lib/citation-audit/audit-page.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/citation-audit/audit-page.test.ts
import { describe, it, expect } from 'vitest';
import { auditPage } from './audit-page';
import { RUBRIC_WEIGHTS_TOTAL } from './rubric';
import { CHECKS } from './checks';

const HIGH = `<!doctype html><html lang="en">
<head>
  <title>AI Strategy Services — Example Co</title>
  <link rel="canonical" href="https://example.com/services/ai">
  <meta name="description" content="Example Co is a strategy firm helping mid-market companies adopt AI without the hype. Discovery, roadmaps, partnership.">
  <script type="application/ld+json">{"@type":"Service","name":"AI Strategy","provider":{"@type":"Organization","name":"Example Co","sameAs":"https://en.wikipedia.org/wiki/Example_Co"},"dateModified":"${new Date().toISOString()}"}</script>
</head>
<body>
  <h1>AI Strategy Services</h1>
  <article>
    <p>Example Co is a strategy firm helping mid-market companies adopt AI. We run discovery, build roadmaps, and partner long-term with leadership teams across Cleveland, Austin, and Boston.</p>
    <h2>What does this include?</h2>
    <ul><li>Discovery</li><li>Roadmaps</li><li>Partnership</li></ul>
    <h2>How does pricing work?</h2>
    <p>We price per engagement. Most projects run 3-6 months and cost between $40,000 and $120,000.</p>
    <a href="https://example.com/about">About</a>
    <a href="https://example.com/contact">Contact</a>
    <a href="https://example.com/case-studies">Case studies</a>
    <a href="https://en.wikipedia.org/wiki/Artificial_intelligence">Wikipedia: AI</a>
  </article>
</body></html>`;

const LOW = `<html><body><div>nothing</div></body></html>`;

describe('auditPage', () => {
  it('returns one check per rubric entry', async () => {
    const r = await auditPage({ url: 'https://example.com/services/ai', entityName: 'Example Co', html: HIGH, fetchedAt: '2026-05-19T00:00:00Z' });
    expect(r.checks.length).toBe(CHECKS.length);
  });

  it('scores a high-quality page high', async () => {
    const r = await auditPage({ url: 'https://example.com/services/ai', entityName: 'Example Co', html: HIGH, fetchedAt: '2026-05-19T00:00:00Z' });
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(['good', 'excellent']).toContain(r.tier);
  });

  it('scores a stripped-down page low', async () => {
    const r = await auditPage({ url: 'https://example.com/', entityName: 'Example Co', html: LOW, fetchedAt: '2026-05-19T00:00:00Z' });
    expect(r.score).toBeLessThan(50);
    expect(r.tier).toBe('poor');
  });

  it('total of weights equals rubric total', async () => {
    const r = await auditPage({ url: 'https://example.com/', entityName: 'Example Co', html: LOW, fetchedAt: '2026-05-19T00:00:00Z' });
    const sum = r.checks.reduce((a, c) => a + c.weight, 0);
    expect(sum).toBe(RUBRIC_WEIGHTS_TOTAL);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** `pnpm test src/lib/citation-audit/audit-page.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/lib/citation-audit/audit-page.ts
import type { AuditInput, AuditResult } from './types';
import { parsePage } from './parse';
import { CHECKS } from './checks';
import { aggregate } from './score';

export async function auditPage(input: AuditInput): Promise<AuditResult> {
  const t0 = Date.now();
  const parsed = parsePage(input.url, input.html);
  const ctx = { entityName: input.entityName };
  const checks = CHECKS.map((mod) => mod.check(parsed, ctx));
  const { score, tier } = aggregate(checks);
  return { score, tier, checks, metadata: { parseMs: Date.now() - t0 } };
}
```

- [ ] **Step 4: Run, expect PASS.** `pnpm test src/lib/citation-audit/audit-page.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/citation-audit/audit-page.ts src/lib/citation-audit/audit-page.test.ts
git commit -m "feat(citation-audit): audit-page engine entry"
```

---

### Task 24: Cloudflare Browser Rendering fetch module

**Files:**
- Create: `src/lib/citation-audit/fetch.ts`, `src/lib/citation-audit/fetch.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/citation-audit/fetch.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  process.env.CLOUDFLARE_ACCOUNT_ID = 'acct-test';
  process.env.CLOUDFLARE_BROWSER_RENDERING_TOKEN = 'tok-test';
});

import { fetchRenderedHtml } from './fetch';

describe('fetchRenderedHtml', () => {
  it('returns ok with html on 200', async () => {
    fetchMock.mockResolvedValue(new Response('<html></html>', {
      status: 200,
      headers: { 'content-type': 'text/html', 'x-browser-ms-used': '1234' },
    }));
    const r = await fetchRenderedHtml('https://example.com/');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.html).toBe('<html></html>');
      expect(r.browserMsUsed).toBe(1234);
    }
  });

  it('returns auth failure on 401', async () => {
    fetchMock.mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    const r = await fetchRenderedHtml('https://example.com/');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('auth');
      expect(r.status).toBe(401);
    }
  });

  it('returns cloudflare failure on 5xx', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));
    const r = await fetchRenderedHtml('https://example.com/');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('cloudflare');
  });

  it('returns http failure when target site failed inside cf response', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false, errors: [{ code: 1000, message: 'target site returned 404' }] }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    }));
    const r = await fetchRenderedHtml('https://example.com/');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('http');
  });

  it('returns timeout on AbortError', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    const r = await fetchRenderedHtml('https://example.com/');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('timeout');
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** `pnpm test src/lib/citation-audit/fetch.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/lib/citation-audit/fetch.ts
import type { FetchOutcome } from './types';

const CF_TIMEOUT_MS = 25_000;
const USER_AGENT = 'CitationReadiness/1.0 (+https://make-a-llms.txt/bot)';

export async function fetchRenderedHtml(url: string): Promise<FetchOutcome> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_BROWSER_RENDERING_TOKEN;
  if (!accountId || !token) {
    return { ok: false, reason: 'auth', message: 'Cloudflare Browser Rendering credentials are not configured.' };
  }
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/content`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CF_TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        gotoOptions: { waitUntil: 'networkidle0', timeout: 20_000 },
        rejectResourceTypes: ['image', 'media', 'font'],
        userAgent: USER_AGENT,
      }),
    });
    const fetchMs = Date.now() - t0;
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: 'auth', status: res.status, message: `Cloudflare returned ${res.status}.` };
    }
    if (res.status >= 500) {
      return { ok: false, reason: 'cloudflare', status: res.status, message: `Cloudflare returned ${res.status}.` };
    }
    if (res.status === 400 && res.headers.get('content-type')?.includes('application/json')) {
      const body = await res.json() as { success?: boolean; errors?: { code?: number; message?: string }[] };
      const msg = body.errors?.[0]?.message ?? 'Target site fetch failed.';
      return { ok: false, reason: 'http', status: res.status, message: msg };
    }
    if (!res.ok) {
      return { ok: false, reason: 'unknown', status: res.status, message: `HTTP ${res.status}` };
    }
    const html = await res.text();
    const browserMsUsed = Number(res.headers.get('x-browser-ms-used') ?? 0);
    return { ok: true, html, fetchedAt: new Date().toISOString(), fetchMs, browserMsUsed };
  } catch (e) {
    const err = e as Error & { name?: string };
    if (err.name === 'AbortError') {
      return { ok: false, reason: 'timeout', message: `Cloudflare Browser Rendering timed out after ${CF_TIMEOUT_MS}ms.` };
    }
    return { ok: false, reason: 'unknown', message: err.message };
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run, expect PASS.** `pnpm test src/lib/citation-audit/fetch.test.ts`

- [ ] **Step 5: Update `.env.example`**

Add directly after the existing `CLOUDFLARE_ACCOUNT_ID` line:

```
CLOUDFLARE_BROWSER_RENDERING_TOKEN=
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/citation-audit/fetch.ts src/lib/citation-audit/fetch.test.ts .env.example
git commit -m "feat(citation-audit): Cloudflare Browser Rendering fetch client"
```

---

### Task 25: `runCitationAudit` library + index

**Files:**
- Create: `src/lib/citation-audit/run.ts`, `src/lib/citation-audit/run.test.ts`, `src/lib/citation-audit/index.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/citation-audit/run.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users, sites, generations, citationAudits } from '@/db/schema';

vi.mock('./fetch', () => ({
  fetchRenderedHtml: vi.fn(),
}));
import { fetchRenderedHtml } from './fetch';
import { runCitationAudit } from './run';

const HIGH_HTML = `<!doctype html><html><head><title>Example Co — AI Strategy</title>
<link rel="canonical" href="https://example.com/">
<meta name="description" content="Example Co provides strategy for mid-market companies seeking AI clarity. Workshops, roadmaps, partnership.">
<script type="application/ld+json">{"@type":"Service","name":"X","provider":{"@type":"Organization","name":"Example Co"}}</script>
</head><body><h1>AI</h1><article><p>Example Co is a firm. Example Co helps companies adopt AI.</p><h2>Why?</h2><h2>How?</h2><ul><li>x</li></ul></article></body></html>`;

async function seedSiteAndManifest(): Promise<{ siteId: number }> {
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'U', email: 'u@x.test' }).returning();
  const [s] = await db.insert(sites).values({
    userId: u.id, name: 'Example Co', rootUrl: 'https://example.com',
    webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_abcd',
  }).returning();
  // The "latest manifest" check in run.ts should query generations + manifest blob.
  // For this unit test we stub the manifest-lookup helper via vi.mock if needed.
  return { siteId: s.id };
}

describe('runCitationAudit', () => {
  beforeEach(async () => {
    await setupTestDb();
    vi.mocked(fetchRenderedHtml).mockReset();
  });

  it('persists a succeeded row on successful fetch', async () => {
    vi.mocked(fetchRenderedHtml).mockResolvedValue({
      ok: true, html: HIGH_HTML, fetchedAt: '2026-05-19T00:00:00Z', fetchMs: 100, browserMsUsed: 200,
    });
    const { siteId } = await seedSiteAndManifest();
    const audit = await runCitationAudit({ siteId, pageUrl: 'https://example.com/' });
    expect(audit.status).toBe('succeeded');
    expect(audit.score).not.toBeNull();
    expect(audit.results).not.toBeNull();
    // Round-trip via DB
    const [row] = await getDb().select().from(citationAudits).where(/* eq(citationAudits.id, audit.id) */ );
    expect(row.pageUrl).toBe('https://example.com/');
  });

  it('persists a failed row on fetch error', async () => {
    vi.mocked(fetchRenderedHtml).mockResolvedValue({
      ok: false, reason: 'http', status: 404, message: 'Target site returned 404',
    });
    const { siteId } = await seedSiteAndManifest();
    const audit = await runCitationAudit({ siteId, pageUrl: 'https://example.com/missing' });
    expect(audit.status).toBe('failed');
    expect(audit.score).toBeNull();
    expect(audit.errorReason).toBe('http');
    expect(audit.errorMessage).toMatch(/404/);
  });
});
```

(Note: the `eq` import and final select-by-id wiring may need a tweak; importing `eq` from `drizzle-orm` is required. Adjust the `where(...)` line accordingly. Manifest-membership enforcement: see Step 3.)

- [ ] **Step 2: Run, expect FAIL.** `pnpm test src/lib/citation-audit/run.test.ts`

- [ ] **Step 3: Implement `run.ts`**

Manifest membership check is enforced in the **API route layer** (which has access to the manifest blob via existing helpers), not inside `runCitationAudit`, so the library function stays a pure fetch+score+persist:

```ts
// src/lib/citation-audit/run.ts
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sites, citationAudits } from '@/db/schema';
import type { CitationAudit } from '@/db/schema';
import { fetchRenderedHtml } from './fetch';
import { auditPage } from './audit-page';

export async function runCitationAudit(opts: {
  siteId: number;
  pageUrl: string;
}): Promise<CitationAudit> {
  const db = getDb();
  const [site] = await db.select().from(sites).where(eq(sites.id, opts.siteId));
  if (!site) throw new Error(`site ${opts.siteId} not found`);

  const fetched = await fetchRenderedHtml(opts.pageUrl);
  if (!fetched.ok) {
    const [row] = await db.insert(citationAudits).values({
      siteId: opts.siteId,
      pageUrl: opts.pageUrl,
      status: 'failed',
      errorReason: fetched.reason,
      errorMessage: fetched.message,
      trigger: 'manual',
    }).returning();
    return row;
  }

  const result = await auditPage({
    url: opts.pageUrl,
    entityName: site.name,
    html: fetched.html,
    fetchedAt: fetched.fetchedAt,
  });

  const [row] = await db.insert(citationAudits).values({
    siteId: opts.siteId,
    pageUrl: opts.pageUrl,
    status: 'succeeded',
    score: result.score,
    tier: result.tier,
    results: JSON.stringify(result),
    fetchMs: fetched.fetchMs,
    browserMsUsed: fetched.browserMsUsed,
    trigger: 'manual',
  }).returning();
  return row;
}
```

- [ ] **Step 4: Implement `src/lib/citation-audit/index.ts`**

```ts
// src/lib/citation-audit/index.ts
export { auditPage } from './audit-page';
export { runCitationAudit } from './run';
export { fetchRenderedHtml } from './fetch';
export type * from './types';
```

- [ ] **Step 5: Run, expect PASS.** `pnpm test src/lib/citation-audit/run.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/lib/citation-audit/run.ts src/lib/citation-audit/run.test.ts src/lib/citation-audit/index.ts
git commit -m "feat(citation-audit): runCitationAudit + public surface"
```

---

### Task 26: Zod validators for the API

**Files:**
- Create: `src/lib/validators/citation-audits.ts`, `src/lib/validators/citation-audits.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/validators/citation-audits.test.ts
import { describe, it, expect } from 'vitest';
import { runCitationAuditBodySchema, listCitationAuditsQuerySchema } from './citation-audits';

describe('citation audit validators', () => {
  it('accepts a valid POST body', () => {
    expect(runCitationAuditBodySchema.safeParse({ pageUrl: 'https://example.com/x' }).success).toBe(true);
  });
  it('rejects non-URL pageUrl', () => {
    expect(runCitationAuditBodySchema.safeParse({ pageUrl: 'not-a-url' }).success).toBe(false);
  });
  it('accepts optional limit + cursor on history query', () => {
    const r = listCitationAuditsQuerySchema.safeParse({ pageUrl: 'https://x.com/a', limit: '10' });
    expect(r.success).toBe(true);
  });
  it('rejects missing pageUrl on history query', () => {
    expect(listCitationAuditsQuerySchema.safeParse({}).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect FAIL.** `pnpm test src/lib/validators/citation-audits.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/lib/validators/citation-audits.ts
import { z } from 'zod';

export const runCitationAuditBodySchema = z.object({
  pageUrl: z.string().url(),
}).strict();

export const listCitationAuditsQuerySchema = z.object({
  pageUrl: z.string().url(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
  cursor: z.string().optional(),
});

export type RunCitationAuditBody = z.infer<typeof runCitationAuditBodySchema>;
export type ListCitationAuditsQuery = z.infer<typeof listCitationAuditsQuerySchema>;
```

- [ ] **Step 4: Run, expect PASS.** `pnpm test src/lib/validators/citation-audits.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/lib/validators/citation-audits.ts src/lib/validators/citation-audits.test.ts
git commit -m "feat(citation-audit): zod validators"
```

---

### Task 27: Internal session-authed API routes

**Files:**
- Create: `src/app/api/sites/[id]/citation-audits/route.ts` + `.test.ts`
- Create: `src/app/api/sites/[id]/citation-audits/latest/route.ts` + `.test.ts`
- Create: `src/app/api/sites/[id]/citation-audits/[auditUid]/route.ts` + `.test.ts`

Each route handler follows the pattern in `src/app/api/sites/[id]/audits/route.ts`. The POST handler must verify `pageUrl` is in the site's latest pages manifest before running the audit.

- [ ] **Step 1: Write the route + test for the base `route.ts` (GET history + POST run)**

```ts
// src/app/api/sites/[id]/citation-audits/route.ts
import { ZodError } from 'zod';
import { and, eq, desc, lt } from 'drizzle-orm';
import { getDb } from '@/db';
import { citationAudits } from '@/db/schema';
import { ApiError, apiErrorResponse, assertOwnsSiteByUid, requireUserOrThrow } from '@/lib/auth-guards';
import { parseUid } from '@/lib/uid';
import { runCitationAudit } from '@/lib/citation-audit';
import { runCitationAuditBodySchema, listCitationAuditsQuerySchema } from '@/lib/validators/citation-audits';
import { assertPageUrlInLatestManifest } from '@/lib/citation-audit/manifest-membership';

type Ctx = { params: Promise<{ id: string }> };

async function parseSiteUid(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params;
  try { return parseUid(id); } catch (e) {
    if (e instanceof ZodError) throw new ApiError(400, 'validation', 'Site id must be a UUID');
    throw e;
  }
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const uid = await parseSiteUid(ctx);
    const site = await assertOwnsSiteByUid(uid, user.id);
    const url = new URL(req.url);
    const parsed = listCitationAuditsQuerySchema.safeParse({
      pageUrl: url.searchParams.get('pageUrl') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
    });
    if (!parsed.success) throw new ApiError(400, 'validation', parsed.error.message);
    const { pageUrl, limit, cursor } = parsed.data;
    let q = getDb().select().from(citationAudits)
      .where(and(eq(citationAudits.siteId, site.id), eq(citationAudits.pageUrl, pageUrl)));
    if (cursor) q = q.where(lt(citationAudits.fetchedAt, cursor)) as typeof q;
    const audits = await q.orderBy(desc(citationAudits.fetchedAt)).limit(limit);
    const nextCursor = audits.length === limit ? audits[audits.length - 1].fetchedAt : null;
    return Response.json({ audits, nextCursor });
  } catch (err) { return apiErrorResponse(err); }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const uid = await parseSiteUid(ctx);
    const site = await assertOwnsSiteByUid(uid, user.id);
    const body = runCitationAuditBodySchema.safeParse(await req.json());
    if (!body.success) throw new ApiError(400, 'validation', body.error.message);
    await assertPageUrlInLatestManifest(site.id, body.data.pageUrl);
    const audit = await runCitationAudit({ siteId: site.id, pageUrl: body.data.pageUrl });
    return Response.json({ audit });
  } catch (err) { return apiErrorResponse(err); }
}
```

- [ ] **Step 2: Implement the manifest-membership helper**

```ts
// src/lib/citation-audit/manifest-membership.ts
import { desc, eq } from 'drizzle-orm';
import { get } from '@vercel/blob';
import { getDb } from '@/db';
import { generations } from '@/db/schema';
import { ApiError } from '@/lib/auth-guards';

export async function assertPageUrlInLatestManifest(siteId: number, pageUrl: string): Promise<void> {
  const [gen] = await getDb()
    .select()
    .from(generations)
    .where(eq(generations.siteId, siteId))
    .orderBy(desc(generations.createdAt))
    .limit(1);
  if (!gen || gen.pagesStatus !== 'succeeded' || !gen.pagesManifestBlobPath) {
    throw new ApiError(422, 'no_manifest', 'No successful generation manifest available for this site.');
  }
  const blob = await get(gen.pagesManifestBlobPath);
  const text = await (await fetch(blob.url)).text();
  const manifest = JSON.parse(text) as { pages?: { url: string; status?: string }[] };
  const known = (manifest.pages ?? []).some((p) => p.url === pageUrl);
  if (!known) {
    throw new ApiError(422, 'unknown_page', `pageUrl is not in the latest pages manifest.`);
  }
}
```

Note: confirm the actual manifest shape in `src/lib/markdown-pages/manifest.ts` and adjust the parse accordingly. If a helper for "read manifest by blob path" already exists, prefer it over hand-fetching.

- [ ] **Step 3: Implement `latest/route.ts`**

```ts
// src/app/api/sites/[id]/citation-audits/latest/route.ts
import { ZodError } from 'zod';
import { eq, desc, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { citationAudits } from '@/db/schema';
import { ApiError, apiErrorResponse, assertOwnsSiteByUid, requireUserOrThrow } from '@/lib/auth-guards';
import { parseUid } from '@/lib/uid';

type Ctx = { params: Promise<{ id: string }> };

async function parseSiteUid(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params;
  try { return parseUid(id); } catch (e) {
    if (e instanceof ZodError) throw new ApiError(400, 'validation', 'Site id must be a UUID');
    throw e;
  }
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const uid = await parseSiteUid(ctx);
    const site = await assertOwnsSiteByUid(uid, user.id);
    // Latest audit per pageUrl via window function (SQLite supports as of recent versions).
    const rows = await getDb().select().from(citationAudits)
      .where(eq(citationAudits.siteId, site.id))
      .orderBy(desc(citationAudits.fetchedAt));
    const seen = new Set<string>();
    const latest: typeof rows = [];
    for (const r of rows) {
      if (seen.has(r.pageUrl)) continue;
      seen.add(r.pageUrl);
      latest.push(r);
    }
    return Response.json({ audits: latest });
  } catch (err) { return apiErrorResponse(err); }
}
```

(The in-memory dedup is fine for small `N` rows per site. If sites grow into thousands of audits, swap to a `GROUP BY pageUrl HAVING MAX(fetchedAt)` raw SQL — but that's a v1.x optimization.)

- [ ] **Step 4: Implement `[auditUid]/route.ts`**

```ts
// src/app/api/sites/[id]/citation-audits/[auditUid]/route.ts
import { ZodError } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { citationAudits } from '@/db/schema';
import { ApiError, apiErrorResponse, assertOwnsSiteByUid, requireUserOrThrow } from '@/lib/auth-guards';
import { parseUid } from '@/lib/uid';

type Ctx = { params: Promise<{ id: string; auditUid: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id, auditUid } = await ctx.params;
    const siteUid = (() => { try { return parseUid(id); } catch (e) { if (e instanceof ZodError) throw new ApiError(400, 'validation', 'Site id must be a UUID'); throw e; } })();
    const aUid = (() => { try { return parseUid(auditUid); } catch (e) { if (e instanceof ZodError) throw new ApiError(400, 'validation', 'Audit id must be a UUID'); throw e; } })();
    const site = await assertOwnsSiteByUid(siteUid, user.id);
    const [audit] = await getDb().select().from(citationAudits)
      .where(and(eq(citationAudits.siteId, site.id), eq(citationAudits.uid, aUid)));
    if (!audit) throw new ApiError(404, 'not_found', 'Audit not found');
    return Response.json({ audit });
  } catch (err) { return apiErrorResponse(err); }
}
```

- [ ] **Step 5: Tests for all three routes**

Model after `src/app/api/sites/[id]/audits/route.test.ts`. For each route file create a colocated `.test.ts` covering:
- unauth → 401
- cross-tenant (audit/site belongs to other user) → 404
- happy path
- For POST: pageUrl not in manifest → 422; fetch failure → 200 with `status='failed'`; success → 200 with `status='succeeded'`

`@/lib/citation-audit` should be `vi.mock`-ed in route tests so they don't actually call Cloudflare. Example:

```ts
vi.mock('@/lib/citation-audit', () => ({
  runCitationAudit: vi.fn(),
}));
vi.mock('@/lib/citation-audit/manifest-membership', () => ({
  assertPageUrlInLatestManifest: vi.fn(),
}));
```

- [ ] **Step 6: Run all new tests**

Run: `pnpm test src/app/api/sites/\[id\]/citation-audits/`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/sites/\[id\]/citation-audits src/lib/citation-audit/manifest-membership.ts
git commit -m "feat(citation-audit): internal API routes"
```

---

### Task 28: Public v1 API routes

**Files:**
- Create: `src/app/api/v1/sites/[id]/citation-audits/route.ts` + `.test.ts`
- Create: `src/app/api/v1/sites/[id]/citation-audits/latest/route.ts` + `.test.ts`
- Create: `src/app/api/v1/sites/[id]/citation-audits/[auditUid]/route.ts` + `.test.ts`

These mirror Task 27 but swap session auth for bearer auth.

- [ ] **Step 1: Implement all three route files**

Pattern (POST + GET history):

```ts
// src/app/api/v1/sites/[id]/citation-audits/route.ts
import { ZodError } from 'zod';
import { and, desc, eq, lt } from 'drizzle-orm';
import { getDb } from '@/db';
import { citationAudits } from '@/db/schema';
import { ApiError, apiErrorResponse, assertOwnsSiteByUid, requireApiTokenOrThrow } from '@/lib/auth-guards';
import { parseUid } from '@/lib/uid';
import { runCitationAudit } from '@/lib/citation-audit';
import { runCitationAuditBodySchema, listCitationAuditsQuerySchema } from '@/lib/validators/citation-audits';
import { assertPageUrlInLatestManifest } from '@/lib/citation-audit/manifest-membership';

type Ctx = { params: Promise<{ id: string }> };

async function parseSiteUid(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params;
  try { return parseUid(id); } catch (e) {
    if (e instanceof ZodError) throw new ApiError(400, 'validation', 'Site id must be a UUID');
    throw e;
  }
}

function serialize(a: typeof citationAudits.$inferSelect, siteUid: string) {
  return {
    id: a.uid,
    siteId: siteUid,
    pageUrl: a.pageUrl,
    status: a.status,
    score: a.score,
    tier: a.tier,
    fetchedAt: a.fetchedAt,
    fetchMs: a.fetchMs,
    browserMsUsed: a.browserMsUsed,
    trigger: a.trigger,
    errorReason: a.errorReason,
    errorMessage: a.errorMessage,
    results: a.results ? JSON.parse(a.results) : null,
  };
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await requireApiTokenOrThrow(req);
    const uid = await parseSiteUid(ctx);
    const site = await assertOwnsSiteByUid(uid, user.id);
    const url = new URL(req.url);
    const parsed = listCitationAuditsQuerySchema.safeParse({
      pageUrl: url.searchParams.get('pageUrl') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
    });
    if (!parsed.success) throw new ApiError(400, 'validation', parsed.error.message);
    const { pageUrl, limit, cursor } = parsed.data;
    let q = getDb().select().from(citationAudits)
      .where(and(eq(citationAudits.siteId, site.id), eq(citationAudits.pageUrl, pageUrl)));
    if (cursor) q = q.where(lt(citationAudits.fetchedAt, cursor)) as typeof q;
    const rows = await q.orderBy(desc(citationAudits.fetchedAt)).limit(limit);
    const nextCursor = rows.length === limit ? rows[rows.length - 1].fetchedAt : null;
    return Response.json({ audits: rows.map((r) => serialize(r, site.uid)), nextCursor });
  } catch (err) { return apiErrorResponse(err); }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requireApiTokenOrThrow(req);
    const uid = await parseSiteUid(ctx);
    const site = await assertOwnsSiteByUid(uid, user.id);
    const body = runCitationAuditBodySchema.safeParse(await req.json());
    if (!body.success) throw new ApiError(400, 'validation', body.error.message);
    await assertPageUrlInLatestManifest(site.id, body.data.pageUrl);
    const audit = await runCitationAudit({ siteId: site.id, pageUrl: body.data.pageUrl });
    return Response.json({ audit: serialize(audit, site.uid) });
  } catch (err) { return apiErrorResponse(err); }
}
```

The two GET-only files (`latest` and `[auditUid]`) follow the same pattern: swap `requireUserOrThrow` for `requireApiTokenOrThrow`, serialize using the helper above.

**Note:** the `serialize` helper is duplicated between `route.ts`, `latest/route.ts`, and `[auditUid]/route.ts` here for clarity. In the actual implementation, extract it to `src/lib/citation-audit/serialize.ts` and import from all three to avoid drift.

- [ ] **Step 2: Tests**

Model after `src/app/api/v1/generations/route.test.ts`. Cover:
- missing bearer → 401
- invalid token → 401
- cross-tenant siteUid → 404
- happy path POST returns `status='succeeded'` serialized row
- happy path GET history returns ordered rows + nextCursor
- happy path GET single by auditUid

- [ ] **Step 3: Run all tests**

Run: `pnpm test src/app/api/v1/sites/\[id\]/citation-audits/`
Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/v1/sites/\[id\]/citation-audits src/lib/citation-audit/serialize.ts
git commit -m "feat(citation-audit): public v1 API routes"
```

---

### Task 29: OpenAPI schemas + route registry entries

**Files:**
- Modify: `src/lib/openapi/schemas.ts`
- Modify: `src/lib/openapi/routes.ts`

- [ ] **Step 1: Add schemas to `src/lib/openapi/schemas.ts`**

Append to the existing file:

```ts
// Citation audit schemas
export const citationTierEnum = z
  .enum(['poor', 'fair', 'good', 'excellent'])
  .meta({ id: 'CitationTier' });

export const citationCheckResultSchema = z.object({
  id: z.string(),
  passed: z.boolean(),
  score: z.number().int().min(0).max(100),
  weight: z.number().int().min(0).max(100),
  evidence: z.array(z.string()),
  recommendation: z.string().nullable(),
}).meta({ id: 'CitationCheckResult' });

export const citationAuditResultsSchema = z.object({
  score: z.number().int().min(0).max(100),
  tier: citationTierEnum,
  checks: z.array(citationCheckResultSchema),
  metadata: z.object({ parseMs: z.number().int().nonnegative() }),
}).meta({ id: 'CitationAuditResults' });

export const citationAuditViewSchema = z.object({
  id: z.string().uuid(),
  siteId: z.string().uuid(),
  pageUrl: z.string().url(),
  status: z.enum(['succeeded', 'failed']),
  score: z.number().int().min(0).max(100).nullable(),
  tier: citationTierEnum.nullable(),
  fetchedAt: z.string(),
  fetchMs: z.number().int().nullable(),
  browserMsUsed: z.number().int().nullable(),
  trigger: z.literal('manual'),
  errorReason: z.string().nullable(),
  errorMessage: z.string().nullable(),
  results: citationAuditResultsSchema.nullable(),
}).meta({ id: 'CitationAudit' });

export const citationAuditListSchema = z.object({
  audits: z.array(citationAuditViewSchema),
  nextCursor: z.string().nullable(),
}).meta({ id: 'CitationAuditList' });

export const citationAuditLatestSchema = z.object({
  audits: z.array(citationAuditViewSchema),
}).meta({ id: 'CitationAuditLatest' });

export const citationAuditSingleSchema = z.object({
  audit: citationAuditViewSchema,
}).meta({ id: 'CitationAuditSingle' });

export const runCitationAuditV1Schema = z.object({
  pageUrl: z.string().url(),
}).strict().meta({ id: 'RunCitationAudit' });
```

- [ ] **Step 2: Register routes in `src/lib/openapi/routes.ts`**

Append:

```ts
// citation audits
listCitationAuditsLatest: {
  method: 'get',
  path: '/sites/{siteId}/citation-audits/latest',
  summary: 'Latest citation audit per page for a site',
  tags: ['citation-audits'],
  pathParams: { siteId: 'uuid' as const },
  responses: {
    200: { description: 'OK', schema: citationAuditLatestSchema },
    401: { description: 'Unauthenticated', schema: errorSchema },
    404: { description: 'Site not found', schema: errorSchema },
  },
},
listCitationAudits: {
  method: 'get',
  path: '/sites/{siteId}/citation-audits',
  summary: 'Citation audit history for a page',
  tags: ['citation-audits'],
  pathParams: { siteId: 'uuid' as const },
  queryParams: {
    pageUrl: { type: 'string' as const, format: 'uri', required: true },
    limit: { type: 'integer' as const, required: false },
    cursor: { type: 'string' as const, required: false },
  },
  responses: {
    200: { description: 'OK', schema: citationAuditListSchema },
    400: { description: 'Validation error', schema: errorSchema },
    401: { description: 'Unauthenticated', schema: errorSchema },
    404: { description: 'Site not found', schema: errorSchema },
  },
},
getCitationAudit: {
  method: 'get',
  path: '/sites/{siteId}/citation-audits/{auditId}',
  summary: 'Fetch a single citation audit',
  tags: ['citation-audits'],
  pathParams: { siteId: 'uuid' as const, auditId: 'uuid' as const },
  responses: {
    200: { description: 'OK', schema: citationAuditSingleSchema },
    401: { description: 'Unauthenticated', schema: errorSchema },
    404: { description: 'Audit not found', schema: errorSchema },
  },
},
createCitationAudit: {
  method: 'post',
  path: '/sites/{siteId}/citation-audits',
  summary: 'Run a new citation audit for a page',
  tags: ['citation-audits'],
  pathParams: { siteId: 'uuid' as const },
  requestBody: runCitationAuditV1Schema,
  responses: {
    200: { description: 'OK', schema: citationAuditSingleSchema },
    400: { description: 'Validation error', schema: errorSchema },
    401: { description: 'Unauthenticated', schema: errorSchema },
    404: { description: 'Site not found', schema: errorSchema },
    422: { description: 'pageUrl not in latest manifest', schema: errorSchema },
  },
},
```

Add to imports at top:

```ts
import {
  ...,
  citationAuditLatestSchema, citationAuditListSchema,
  citationAuditSingleSchema, runCitationAuditV1Schema,
} from './schemas';
```

- [ ] **Step 3: Run schema + document tests**

Run: `pnpm test src/lib/openapi/`
Expected: pass. If `document.test.ts` snapshots the OpenAPI document, the snapshot will need updating (`pnpm test -- -u`).

- [ ] **Step 4: Commit**

```bash
git add src/lib/openapi/schemas.ts src/lib/openapi/routes.ts src/lib/openapi/__snapshots__ 2>/dev/null || true
git commit -m "feat(citation-audit): OpenAPI schemas and routes"
```

---

### Task 30: UI atoms (`tier-pill`, `score-badge`, `check-row`)

**Files:**
- Create: `src/components/citations/citations-tier-pill.tsx` + `.test.tsx`
- Create: `src/components/citations/citations-score-badge.tsx` + `.test.tsx`
- Create: `src/components/citations/citations-check-row.tsx` + `.test.tsx`

These are pure presentational components driven by props. Tests use React Testing Library.

- [ ] **Step 1: `citations-tier-pill.tsx`**

```tsx
// src/components/citations/citations-tier-pill.tsx
import { cn } from '@/lib/utils';

const PALETTE: Record<string, string> = {
  excellent: 'bg-semantic-success/15 text-semantic-success',
  good:      'bg-timeline-done/30 text-ink',
  fair:      'bg-timeline-thinking/30 text-ink',
  poor:      'bg-semantic-error/15 text-semantic-error',
  none:      'bg-timeline-read/30 text-body',
};

type Tier = 'excellent' | 'good' | 'fair' | 'poor' | 'none';

export function CitationsTierPill({ tier, className }: { tier: Tier; className?: string }) {
  const label = tier === 'none' ? '—' : tier[0].toUpperCase() + tier.slice(1);
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-xs caption-uppercase', PALETTE[tier], className)}>
      {label}
    </span>
  );
}
```

Test:

```tsx
// src/components/citations/citations-tier-pill.test.tsx
import { render, screen } from '@testing-library/react';
import { CitationsTierPill } from './citations-tier-pill';

test.each(['poor', 'fair', 'good', 'excellent', 'none'] as const)('renders %s tier', (t) => {
  render(<CitationsTierPill tier={t} />);
  expect(screen.getByText(t === 'none' ? '—' : new RegExp(t, 'i'))).toBeInTheDocument();
});
```

- [ ] **Step 2: `citations-score-badge.tsx`**

```tsx
// src/components/citations/citations-score-badge.tsx
import { cn } from '@/lib/utils';
import { CitationsTierPill } from './citations-tier-pill';

type Tier = 'excellent' | 'good' | 'fair' | 'poor';

export function CitationsScoreBadge({ score, tier, failingCount, totalCount }: {
  score: number; tier: Tier; failingCount: number; totalCount: number;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className={cn(
        'flex flex-col items-center justify-center rounded-xl border-hairline w-24 h-24 bg-surface-card',
      )}>
        <span className="display-md leading-none">{score}</span>
        <span className="text-xs text-body">/100</span>
      </div>
      <div className="flex flex-col gap-1">
        <CitationsTierPill tier={tier} />
        <span className="text-sm text-body">{failingCount} of {totalCount} checks failing</span>
      </div>
    </div>
  );
}
```

Test:

```tsx
import { render, screen } from '@testing-library/react';
import { CitationsScoreBadge } from './citations-score-badge';

test('shows score, tier, and failing count', () => {
  render(<CitationsScoreBadge score={64} tier="fair" failingCount={5} totalCount={15} />);
  expect(screen.getByText('64')).toBeInTheDocument();
  expect(screen.getByText(/fair/i)).toBeInTheDocument();
  expect(screen.getByText(/5 of 15 checks failing/i)).toBeInTheDocument();
});
```

- [ ] **Step 3: `citations-check-row.tsx`**

```tsx
// src/components/citations/citations-check-row.tsx
import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type CheckRow = {
  id: string; passed: boolean; score: number; weight: number;
  evidence: string[]; recommendation: string | null;
};

export function CitationsCheckRow({ check, label }: { check: CheckRow; label: string }) {
  const Icon = check.passed ? Check : X;
  const iconClass = check.passed ? 'text-semantic-success' : 'text-semantic-error';
  return (
    <li className="border-hairline rounded-lg p-3 bg-surface-card">
      <div className="flex items-start gap-2">
        <Icon className={cn('w-4 h-4 mt-1 shrink-0', iconClass)} aria-hidden />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium text-ink">{label}</span>
            <span className="text-xs text-body whitespace-nowrap">weight {check.weight} • {check.score}/100</span>
          </div>
          {check.evidence.length > 0 && (
            <p className="text-sm text-body mt-1">Found: {check.evidence.join(' ')}</p>
          )}
          {check.recommendation && (
            <p className="text-sm text-ink mt-1">Fix: {check.recommendation}</p>
          )}
        </div>
      </div>
    </li>
  );
}
```

Test:

```tsx
import { render, screen } from '@testing-library/react';
import { CitationsCheckRow } from './citations-check-row';

test('renders evidence and recommendation when failing', () => {
  render(<CitationsCheckRow label="H1 present" check={{
    id: 'h1-present', passed: false, score: 0, weight: 5,
    evidence: ['No <h1> found.'], recommendation: 'Add an H1.',
  }} />);
  expect(screen.getByText(/Found:/)).toBeInTheDocument();
  expect(screen.getByText(/Fix:/)).toBeInTheDocument();
});

test('omits Fix line when passing', () => {
  render(<CitationsCheckRow label="H1 present" check={{
    id: 'h1-present', passed: true, score: 100, weight: 5,
    evidence: ["H1 found: 'X'"], recommendation: null,
  }} />);
  expect(screen.queryByText(/Fix:/)).not.toBeInTheDocument();
});
```

- [ ] **Step 4: Run all atom tests**

Run: `pnpm test src/components/citations/`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/citations/citations-tier-pill.tsx src/components/citations/citations-tier-pill.test.tsx \
        src/components/citations/citations-score-badge.tsx src/components/citations/citations-score-badge.test.tsx \
        src/components/citations/citations-check-row.tsx src/components/citations/citations-check-row.test.tsx
git commit -m "feat(citations-ui): tier pill, score badge, check row"
```

---

### Task 31: UI list view + history list

**Files:**
- Create: `src/components/citations/citations-page-table.tsx` + `.test.tsx`
- Create: `src/components/citations/citations-history-list.tsx` + `.test.tsx`

- [ ] **Step 1: `citations-page-table.tsx`**

```tsx
// src/components/citations/citations-page-table.tsx
'use client';
import { CitationsTierPill } from './citations-tier-pill';
import { formatRelativeTime } from '@/lib/format-time';

type Row = {
  pageUrl: string;
  score: number | null;
  tier: 'poor' | 'fair' | 'good' | 'excellent' | null;
  fetchedAt: string | null;
};

export function CitationsPageTable({ rows, onSelect }: { rows: Row[]; onSelect: (pageUrl: string) => void }) {
  if (rows.length === 0) {
    return <p className="text-body">No pages found in the latest generation manifest.</p>;
  }
  return (
    <table className="w-full text-sm border-hairline rounded-lg overflow-hidden">
      <thead className="bg-canvas-soft text-body caption-uppercase text-xs">
        <tr>
          <th className="text-left px-3 py-2">URL</th>
          <th className="text-left px-3 py-2 w-20">Score</th>
          <th className="text-left px-3 py-2 w-24">Tier</th>
          <th className="text-left px-3 py-2 w-28">Last audited</th>
          <th className="w-6"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.pageUrl} className="border-t border-hairline hover:bg-canvas-soft/50 cursor-pointer" onClick={() => onSelect(r.pageUrl)}>
            <td className="px-3 py-2 truncate max-w-[420px]" title={r.pageUrl}>{r.pageUrl}</td>
            <td className="px-3 py-2 font-mono">{r.score ?? '—'}</td>
            <td className="px-3 py-2"><CitationsTierPill tier={r.tier ?? 'none'} /></td>
            <td className="px-3 py-2 text-body">{r.fetchedAt ? formatRelativeTime(r.fetchedAt) : 'Never'}</td>
            <td className="px-3 py-2 text-body">›</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Test:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { CitationsPageTable } from './citations-page-table';

test('renders rows and fires onSelect', () => {
  const onSelect = vi.fn();
  render(<CitationsPageTable rows={[
    { pageUrl: 'https://x.com/a', score: 80, tier: 'good', fetchedAt: new Date().toISOString() },
    { pageUrl: 'https://x.com/b', score: null, tier: null, fetchedAt: null },
  ]} onSelect={onSelect} />);
  expect(screen.getByText('https://x.com/a')).toBeInTheDocument();
  expect(screen.getByText('Never')).toBeInTheDocument();
  fireEvent.click(screen.getByText('https://x.com/a'));
  expect(onSelect).toHaveBeenCalledWith('https://x.com/a');
});

test('shows empty state when no rows', () => {
  render(<CitationsPageTable rows={[]} onSelect={() => {}} />);
  expect(screen.getByText(/no pages/i)).toBeInTheDocument();
});
```

Add `import { vi } from 'vitest';` at top.

- [ ] **Step 2: `citations-history-list.tsx`**

```tsx
// src/components/citations/citations-history-list.tsx
'use client';
import { CitationsTierPill } from './citations-tier-pill';
import { formatRelativeTime } from '@/lib/format-time';

type HistoryItem = {
  id: string;
  score: number | null;
  tier: 'poor' | 'fair' | 'good' | 'excellent' | null;
  fetchedAt: string;
  status: 'succeeded' | 'failed';
};

export function CitationsHistoryList({ items, currentId, onSelect }: {
  items: HistoryItem[]; currentId: string; onSelect: (id: string) => void;
}) {
  if (items.length <= 1) return null;
  return (
    <ul className="flex flex-col gap-1">
      {items.map((it) => (
        <li key={it.id}>
          <button
            type="button"
            onClick={() => onSelect(it.id)}
            className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-md hover:bg-canvas-soft"
            aria-current={it.id === currentId ? 'true' : undefined}
          >
            <span className="text-body text-sm w-28">{formatRelativeTime(it.fetchedAt)}</span>
            <span className="font-mono w-12">{it.score ?? '—'}</span>
            <CitationsTierPill tier={it.tier ?? 'none'} />
            {it.id === currentId && <span className="text-xs text-body ml-2">(current)</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
```

Test:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { CitationsHistoryList } from './citations-history-list';

const items = [
  { id: 'a', score: 80, tier: 'good' as const, fetchedAt: new Date().toISOString(), status: 'succeeded' as const },
  { id: 'b', score: 60, tier: 'fair' as const, fetchedAt: new Date(Date.now() - 86400000).toISOString(), status: 'succeeded' as const },
];

test('marks current and fires onSelect for others', () => {
  const onSelect = vi.fn();
  render(<CitationsHistoryList items={items} currentId="a" onSelect={onSelect} />);
  expect(screen.getByText(/current/i)).toBeInTheDocument();
  fireEvent.click(screen.getByText('60'));
  expect(onSelect).toHaveBeenCalledWith('b');
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm test src/components/citations/`

- [ ] **Step 4: Commit**

```bash
git add src/components/citations/citations-page-table.tsx src/components/citations/citations-page-table.test.tsx \
        src/components/citations/citations-history-list.tsx src/components/citations/citations-history-list.test.tsx
git commit -m "feat(citations-ui): page table and history list"
```

---

### Task 32: UI page detail + tab root + wire-in

**Files:**
- Create: `src/components/citations/citations-page-detail.tsx` + `.test.tsx`
- Create: `src/components/citations/citations-tab.tsx` + `.test.tsx`
- Modify: `src/app/(app)/sites/[id]/site-detail-client.tsx`

This is the largest UI task. `CitationsPageDetail` wires up React Query for the page detail view and is where the `Run new audit` mutation lives.

- [ ] **Step 1: Check-id → label map**

Add at the top of `citations-page-detail.tsx`:

```ts
const CHECK_LABEL: Record<string, string> = {
  'h1-present': 'H1 present',
  'heading-hierarchy': 'Heading hierarchy clean',
  'meta-description': 'Meta description (120-160 chars)',
  'canonical': 'Canonical tag',
  'schema-type': 'Schema.org type',
  'schema-fields': 'Required schema fields',
  'answer-position': 'Answer in first 100 words',
  'entity-first-paragraph': 'Entity in first paragraph',
  'question-h2s': 'Question-style H2s',
  'lists-tables': 'Lists or tables present',
  'definitions': 'Definition pattern in opening',
  'freshness': 'Recently updated',
  'readability': 'Reading level grade 8-10',
  'named-entities': 'Named entities disambiguated',
  'internal-links': 'Internal links to related pages',
};
```

- [ ] **Step 2: `citations-page-detail.tsx`**

```tsx
// src/components/citations/citations-page-detail.tsx
'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { CitationsScoreBadge } from './citations-score-badge';
import { CitationsCheckRow } from './citations-check-row';
import { CitationsHistoryList } from './citations-history-list';
import { formatRelativeTime } from '@/lib/format-time';

// ... (CHECK_LABEL map from Step 1)

type AuditResults = {
  score: number;
  tier: 'poor' | 'fair' | 'good' | 'excellent';
  checks: { id: string; passed: boolean; score: number; weight: number; evidence: string[]; recommendation: string | null }[];
};

type Audit = {
  id: string;
  pageUrl: string;
  status: 'succeeded' | 'failed';
  score: number | null;
  tier: 'poor' | 'fair' | 'good' | 'excellent' | null;
  fetchedAt: string;
  errorReason: string | null;
  errorMessage: string | null;
  results: AuditResults | null;
};

export function CitationsPageDetail({ siteUid, pageUrl, onBack }: { siteUid: string; pageUrl: string; onBack: () => void }) {
  const qc = useQueryClient();
  const [viewingId, setViewingId] = useState<string | null>(null);

  const history = useQuery({
    queryKey: ['citation-audits', 'history', siteUid, pageUrl],
    queryFn: async (): Promise<{ audits: Audit[] }> => {
      const res = await fetch(`/api/sites/${siteUid}/citation-audits?pageUrl=${encodeURIComponent(pageUrl)}&limit=10`);
      if (!res.ok) throw new Error('Failed to load history');
      return res.json();
    },
  });

  const audits = history.data?.audits ?? [];
  const current = audits.find((a) => a.id === viewingId) ?? audits[0];

  const runAudit = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/sites/${siteUid}/citation-audits`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageUrl }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? 'Audit failed');
      return body.audit as Audit;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['citation-audits', 'history', siteUid, pageUrl] });
      qc.invalidateQueries({ queryKey: ['citation-audits', 'latest', siteUid] });
      setViewingId(null);
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-body hover:text-ink">← Back to list</button>
        <Button onClick={() => runAudit.mutate()} disabled={runAudit.isPending}>
          {runAudit.isPending ? 'Auditing… (~10s)' : 'Run new audit'}
        </Button>
      </div>

      <div>
        <h2 className="display-sm">{pageUrl}</h2>
        {current && (
          <p className="text-body text-sm">
            Last audited {formatRelativeTime(current.fetchedAt)} • Audit #{current.id}
          </p>
        )}
      </div>

      {runAudit.isError && (
        <div className="border-hairline rounded-lg p-3 bg-semantic-error/10 text-semantic-error text-sm">
          Audit failed: {(runAudit.error as Error).message}
        </div>
      )}

      {current?.status === 'failed' && (
        <div className="border-hairline rounded-lg p-3 bg-semantic-error/10 text-semantic-error text-sm">
          Audit failed ({current.errorReason}): {current.errorMessage}
        </div>
      )}

      {current?.status === 'succeeded' && current.results && current.score !== null && current.tier && (
        <>
          <CitationsScoreBadge
            score={current.score}
            tier={current.tier}
            failingCount={current.results.checks.filter((c) => !c.passed).length}
            totalCount={current.results.checks.length}
          />
          <section>
            <h3 className="caption-uppercase text-xs text-body mb-2">Checks</h3>
            <ul className="flex flex-col gap-2">
              {[...current.results.checks].sort((a, b) => Number(a.passed) - Number(b.passed)).map((c) => (
                <CitationsCheckRow key={c.id} check={c} label={CHECK_LABEL[c.id] ?? c.id} />
              ))}
            </ul>
          </section>
        </>
      )}

      {audits.length > 1 && (
        <section>
          <h3 className="caption-uppercase text-xs text-body mb-2">Previous audits</h3>
          <CitationsHistoryList
            items={audits.map((a) => ({ id: a.id, score: a.score, tier: a.tier, fetchedAt: a.fetchedAt, status: a.status }))}
            currentId={current?.id ?? ''}
            onSelect={(id) => setViewingId(id)}
          />
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Test for page detail**

```tsx
// src/components/citations/citations-page-detail.test.tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { CitationsPageDetail } from './citations-page-detail';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

const successAudit = {
  id: 'cit_1', pageUrl: 'https://x.com/a', status: 'succeeded', score: 78, tier: 'good',
  fetchedAt: new Date().toISOString(), errorReason: null, errorMessage: null,
  results: {
    score: 78, tier: 'good',
    checks: [
      { id: 'h1-present', passed: true, score: 100, weight: 5, evidence: ['H1 found'], recommendation: null },
      { id: 'answer-position', passed: false, score: 40, weight: 15, evidence: ['Missing entity'], recommendation: 'Add entity.' },
    ],
  },
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return new Response(JSON.stringify({ audit: successAudit }), { status: 200, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ audits: [successAudit] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
});

test('renders score and triggers re-audit', async () => {
  render(wrap(<CitationsPageDetail siteUid="site_1" pageUrl="https://x.com/a" onBack={() => {}} />));
  await waitFor(() => expect(screen.getByText('78')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: /run new audit/i }));
  expect(screen.getByRole('button', { name: /auditing/i })).toBeDisabled();
});
```

- [ ] **Step 4: `citations-tab.tsx`**

```tsx
// src/components/citations/citations-tab.tsx
'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TabPanel } from '@/components/layout/tab-panel';
import { CitationsPageTable } from './citations-page-table';
import { CitationsPageDetail } from './citations-page-detail';

type LatestRow = {
  pageUrl: string;
  score: number | null;
  tier: 'poor' | 'fair' | 'good' | 'excellent' | null;
  fetchedAt: string | null;
};

export function CitationsTab({ siteId }: { siteId: string }) {
  const [selected, setSelected] = useState<string | null>(null);

  const manifest = useQuery({
    queryKey: ['citation-audits', 'manifest-pages', siteId],
    queryFn: async (): Promise<{ pages: { url: string }[] }> => {
      const res = await fetch(`/api/sites/${siteId}/generations/latest/pages`);
      if (!res.ok) return { pages: [] };
      return res.json();
    },
  });

  const latest = useQuery({
    queryKey: ['citation-audits', 'latest', siteId],
    queryFn: async (): Promise<{ audits: { id: string; pageUrl: string; score: number | null; tier: LatestRow['tier']; fetchedAt: string; status: 'succeeded' | 'failed' }[] }> => {
      const res = await fetch(`/api/sites/${siteId}/citation-audits/latest`);
      if (!res.ok) throw new Error('Failed to load latest audits');
      return res.json();
    },
  });

  const pages = manifest.data?.pages ?? [];
  const byUrl = new Map(latest.data?.audits.map((a) => [a.pageUrl, a]) ?? []);
  const rows: LatestRow[] = pages.map((p) => {
    const a = byUrl.get(p.url);
    return {
      pageUrl: p.url,
      score: a?.status === 'succeeded' ? a.score : null,
      tier: a?.status === 'succeeded' ? a.tier : null,
      fetchedAt: a?.fetchedAt ?? null,
    };
  });

  return (
    <TabPanel>
      {selected ? (
        <CitationsPageDetail siteUid={siteId} pageUrl={selected} onBack={() => setSelected(null)} />
      ) : (
        <CitationsPageTable rows={rows} onSelect={setSelected} />
      )}
    </TabPanel>
  );
}
```

Note: the `/api/sites/${siteId}/generations/latest/pages` endpoint may not exist yet. Inspect what's available and either reuse the existing dashboard's pages-list query (look at `pages.md` tab implementation) or add a thin internal helper. Do not invent new endpoints — match the existing pages-tab data source.

- [ ] **Step 5: Test for tab**

```tsx
// src/components/citations/citations-tab.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { CitationsTab } from './citations-tab';

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/pages')) return new Response(JSON.stringify({ pages: [{ url: 'https://x.com/a' }] }), { status: 200 });
    if (url.endsWith('/citation-audits/latest')) return new Response(JSON.stringify({ audits: [] }), { status: 200 });
    return new Response('', { status: 404 });
  }));
});

test('lists pages from the manifest with no audits yet', async () => {
  render(wrap(<CitationsTab siteId="site_1" />));
  await waitFor(() => expect(screen.getByText('https://x.com/a')).toBeInTheDocument());
  expect(screen.getByText('Never')).toBeInTheDocument();
});
```

- [ ] **Step 6: Wire into `site-detail-client.tsx`**

Modify `src/app/(app)/sites/[id]/site-detail-client.tsx`:

```tsx
// add to top imports
import { CitationsTab } from '@/components/citations/citations-tab';
```

Update the existing `<TabsList>` block to add a fourth trigger:

```tsx
<TabsList>
  <TabsTrigger value="llms">llms.txt</TabsTrigger>
  <TabsTrigger value="pages">pages.md</TabsTrigger>
  <TabsTrigger value="crawlers">AI Crawlers</TabsTrigger>
  <TabsTrigger value="citations">Citations</TabsTrigger>
</TabsList>
```

And add the corresponding `<TabsContent>`:

```tsx
<TabsContent value="citations">
  <CitationsTab siteId={site.uid} />
</TabsContent>
```

- [ ] **Step 7: Run all UI tests**

Run: `pnpm test src/components/citations/`
Expected: all pass.

- [ ] **Step 8: Smoke test via dev server**

Run: `pnpm dev`
Open `http://localhost:3000/sites/<existing-site-uid>` in your browser; click the "Citations" tab. With a generation already run on that site, you should see the page list with `—` scores. Click a row; the detail view should load (history empty); click "Run new audit" — verify the spinner appears and the result lands. Stop the dev server.

- [ ] **Step 9: Commit**

```bash
git add src/components/citations/citations-page-detail.tsx src/components/citations/citations-page-detail.test.tsx \
        src/components/citations/citations-tab.tsx src/components/citations/citations-tab.test.tsx \
        src/app/\(app\)/sites/\[id\]/site-detail-client.tsx
git commit -m "feat(citations-ui): page detail, tab root, wire into site detail"
```

---

### Task 33: Public docs

**Files:**
- Create: `content/docs/citation-audits.mdx`
- Modify: `content/docs/meta.json`, `content/docs/quickstart.mdx`

- [ ] **Step 1: Write the docs page**

```mdx
---
title: Citation Audits
description: Score how AI-citation-ready each page on your site is.
---

# Citation Audits

A Citation Audit scores a single page from **0 to 100** on how well it's set up to be cited by AI engines like ChatGPT, Claude, Perplexity, Gemini, and Google AI Overviews. The score comes from 15 independent, deterministic checks over the page's rendered HTML.

## How scoring works

Each check returns its own 0–100 sub-score and contributes to the final score in proportion to its `weight`. The final formula:

```
score = round( Σ (check.score × check.weight) / Σ (check.weight) )
```

The weights total **100**, so the result is on a 0–100 scale.

### Tiers

| Tier      | Range  |
|-----------|--------|
| poor      | 0–49   |
| fair      | 50–69  |
| good      | 70–84  |
| excellent | 85–100 |

### Rubric

| Check ID                  | Weight | What this measures |
|---------------------------|--------|--------------------|
| `h1-present`              | 5      | Exactly one `<h1>` on the page |
| `heading-hierarchy`       | 5      | No skipped heading levels |
| `meta-description`        | 5      | Present, 120–160 characters |
| `canonical`               | 3      | `<link rel="canonical">` present |
| `schema-type`             | 10     | JSON-LD declares a specific Schema.org type |
| `schema-fields`           | 5      | Required fields for the declared type are present |
| `answer-position`         | 15     | Entity name and summary sentence in first 100 words |
| `entity-first-paragraph`  | 8      | Entity name appears in the first paragraph |
| `question-h2s`            | 7      | ≥2 H2 headings phrased as questions |
| `lists-tables`            | 5      | At least one list or table on the page |
| `definitions`             | 5      | An "X is Y" definition pattern in the opening |
| `freshness`               | 8      | `dateModified` within 18 months |
| `readability`             | 5      | Flesch–Kincaid grade level 8–10 |
| `named-entities`          | 9      | ≥3 named entities, with at least one disambiguated |
| `internal-links`          | 5      | ≥3 same-host internal links |

### Worked example

A page with:
- `answer-position`: 40/100 (weight 15)
- `schema-type`: 100/100 (weight 10)
- `freshness`: 100/100 (weight 8)
- (all 12 other checks: 100/100)

```
score = round((40×15 + 100×10 + 100×8 + 100×67) / 100)
      = round((600 + 1000 + 800 + 6700) / 100)
      = round(9100 / 100)
      = 91
```

Tier: **excellent**.

### Failed audits

When the page can't be fetched (404, Cloudflare error, timeout), the audit row is recorded with `status: "failed"`, `score: null`, and `errorReason` populated. **Failed audits are not scored as 0** — they are scoreless events you can retry.

### Determinism and rubric versioning

Citation audits are deterministic: the same HTML always produces the same score. We won't silently change the rubric — weight changes will be announced as an explicit revision.

## The checks

### `h1-present` (weight 5)
**Passes when** the page has exactly one `<h1>`.
**How to fix it** when failing: add a single descriptive H1 at the top of the page. If you have more than one, demote the extras to H2.

### `heading-hierarchy` (weight 5)
**Passes when** heading levels never skip (H1 → H2 → H3, never H1 → H3).
**How to fix it**: insert the missing level or demote the deeper headings.

### `meta-description` (weight 5)
**Passes when** `<meta name="description">` is present and 120–160 characters long.
**How to fix it**: add or resize the meta description.

### `canonical` (weight 3)
**Passes when** `<link rel="canonical">` is present.
**How to fix it**: add the tag pointing to the preferred URL for the page.

### `schema-type` (weight 10)
**Passes when** a JSON-LD block declares an `@type` from the recommended set (Article, BlogPosting, NewsArticle, FAQPage, Product, Service, Organization, AboutPage, WebSite). A generic `WebPage` only counts for partial credit.
**How to fix it**: replace WebPage with a more specific type or add a typed JSON-LD block.

### `schema-fields` (weight 5)
**Passes when** all required fields for the declared type are present (for example, an Article needs `headline`, `datePublished`, and `author`).
**How to fix it**: fill in the missing fields listed in the audit's `evidence`.

### `answer-position` (weight 15)
**Passes when** the first 100 words of the page's main article contain both the entity name (your site name) and a summary sentence.
**How to fix it**: rewrite the opening to name the entity and state what the page is about in the first 1–2 sentences.

### `entity-first-paragraph` (weight 8)
**Passes when** the entity name appears in the very first `<p>` of the article body.
**How to fix it**: mention the entity name in the opening paragraph.

### `question-h2s` (weight 7)
**Passes when** at least 2 H2 headings are phrased as questions (end with `?` or start with what/when/where/who/why/how/is/are/do/does/can/should).
**How to fix it**: rewrite 2+ H2s as questions readers might ask.

### `lists-tables` (weight 5)
**Passes when** the page has at least one `<ul>`, `<ol>`, or `<table>`.
**How to fix it**: convert dense paragraphs into a bulleted list or comparison table where appropriate.

### `definitions` (weight 5)
**Passes when** the first paragraph contains a definition pattern ("X is Y", "X means Y", "X refers to Y").
**How to fix it**: open with a sentence that defines the topic in plain "X is Y" form.

### `freshness` (weight 8)
**Passes when** `dateModified` (from JSON-LD or `article:modified_time`) is within 18 months. 18–36 months: partial credit. Older or missing: 0.
**How to fix it**: add or update `dateModified` and refresh the content.

### `readability` (weight 5)
**Passes when** the Flesch–Kincaid grade level of the article body is between 8 and 10.
**How to fix it**: shorten sentences and simplify word choice (if too high) or add precision (if too low).

### `named-entities` (weight 9)
**Passes when** the page mentions at least 3 named entities AND at least one is disambiguated via a `sameAs` Wikipedia/Wikidata link in JSON-LD or a hyperlink to such a page.
**How to fix it**: name the specific organizations/people/places involved, and link at least one to its authoritative source.

### `internal-links` (weight 5)
**Passes when** the page has at least 3 same-host internal links to other pages on your site.
**How to fix it**: link to related pages to signal a topic cluster.

## Endpoints

See the auto-generated [API reference](/docs/api) for full parameters and example responses:

- `GET /api/v1/sites/{siteId}/citation-audits/latest`
- `GET /api/v1/sites/{siteId}/citation-audits?pageUrl=...`
- `GET /api/v1/sites/{siteId}/citation-audits/{auditId}`
- `POST /api/v1/sites/{siteId}/citation-audits`

## Running an audit

```bash
curl -X POST https://api.example.com/api/v1/sites/<siteId>/citation-audits \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"pageUrl": "https://example.com/services/ai-strategy"}'
```

The request blocks for ~5–15 seconds while we fetch and analyze the page, then returns the persisted audit:

```json
{
  "audit": {
    "id": "cit_01H...",
    "siteId": "site_01H...",
    "pageUrl": "https://example.com/services/ai-strategy",
    "status": "succeeded",
    "score": 78,
    "tier": "good",
    "fetchedAt": "2026-05-19T14:23:11Z",
    "results": { "score": 78, "tier": "good", "checks": [/* ... */], "metadata": { "parseMs": 142 } }
  }
}
```

### Common failure cases

- **404 from your site**: returned as `status: "failed"`, `errorReason: "http"`. Verify the URL is reachable and listed in your latest generation manifest.
- **JS-only page didn't render in time**: usually surfaces as a thin HTML body and low score. Increase your time-to-interactive or check that critical content is in initial HTML.
- **Cloudflare quota / auth**: returned as `errorReason: "cloudflare"` or `"auth"`. Contact support.

### Limits

- `pageUrl` must be in the site's latest successful generation manifest. Arbitrary URLs are rejected with 422.
- Each audit takes ~5–15 seconds. There is no client-side rate limit in v1; please don't run audits in a tight loop.
```

- [ ] **Step 2: Register page in `content/docs/meta.json`**

Open `content/docs/meta.json` and add `"citation-audits"` to the page list (preserve existing order; place after `quickstart` is a reasonable spot).

- [ ] **Step 3: Update `content/docs/quickstart.mdx`**

Append (or insert near the bottom) a short pointer:

```mdx
## Next steps

- See [Citation Audits](./citation-audits) to score how well each page is set up to be cited by AI engines.
```

- [ ] **Step 4: Verify docs build**

Run: `pnpm build`
Expected: build succeeds. If the docs source pipeline runs at build time and complains about MDX or meta.json, fix the offending file before continuing.

- [ ] **Step 5: Run full test suite**

Run: `pnpm test`
Expected: full suite green.

Run: `pnpm lint`
Expected: no lint errors.

- [ ] **Step 6: Commit**

```bash
git add content/docs/citation-audits.mdx content/docs/meta.json content/docs/quickstart.mdx
git commit -m "docs: citation audits — scoring, rubric, and API reference"
```

---

### Task 34: Final verification + push

- [ ] **Step 1: Run preflight**

Run: `pnpm test && pnpm build && pnpm lint`
Expected: all three pass.

- [ ] **Step 2: Manual smoke run**

Run: `pnpm dev`
- Visit `http://localhost:3000/sites/<existing-site-uid>`
- Click the **Citations** tab.
- Verify the page table renders with `—` scores and "Never" timestamps.
- Click a row → page detail panel loads.
- Click **Run new audit** → spinner appears → result renders in ~5–15s with score, tier, and per-check breakdown.
- Re-run the audit on the same page → new row appears in "Previous audits".
- Click an older audit in the history list → display swaps to that audit; "Run new audit" still operates on the live URL.
- Trigger a failure case (point to a URL that returns 404 via a generation that contains broken pages, OR temporarily set `CLOUDFLARE_BROWSER_RENDERING_TOKEN` to an invalid value) → verify the failure banner renders and Retry works.

- [ ] **Step 3: Push the branch**

```bash
git push -u origin feat/citation-readiness-audit
```

- [ ] **Step 4: Open a PR**

Use the `create-pr` skill or `gh pr create`. Reference the design spec and this plan in the PR description. Highlight the env-var addition (`CLOUDFLARE_BROWSER_RENDERING_TOKEN`) so a reviewer knows to provision it before merging to production.

---

## Self-Review Notes

- **Spec coverage:** Each spec section is covered by tasks: schema (Task 1), engine architecture (Tasks 3–6, 22, 23), Cloudflare fetch (Task 24), data model (Task 1), API surface internal + public (Tasks 27, 28), OpenAPI (Task 29), UI (Tasks 30–32), docs (Task 33). The rubric checks are Tasks 7–21.
- **Rubric count:** Plan implements the **15-check** rubric from the spec's rubric table (weights sum to 100). The spec uses "13 checks" colloquially in some narrative passages; the canonical, load-bearing count is `RUBRIC.length === 15`, which Task 5's test asserts directly.
- **Manifest-membership:** added a dedicated helper (`assertPageUrlInLatestManifest`) and exercised in both internal and v1 POST routes.
- **Cross-cutting:** `serialize` helper for v1 routes is called out for extraction to `src/lib/citation-audit/serialize.ts` so it's not duplicated three times.
- **Confirm at runtime:** the manifest-pages endpoint used by `CitationsTab` must be the existing `pages.md`-tab data source rather than a new endpoint — Task 32 flags this; verify the actual route before merging.
