# AI Readiness — Phase 1 (Three-Pillars Reframe) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe the site-detail page from `Pages · llms.txt · AI Crawlers` into a guided readiness journey — `Overview · Readable · Recommendable · Recognized · Setup` — with per-pillar health scores derived from the existing Citation Audit checks.

**Architecture:** Pure-logic first. A new pillar-scoring library tags each existing rubric check with a pillar and rolls per-page audit results into three site-level health scores plus a single "do this next" recommendation — all computed client-side from the existing `/citation-audits/latest` endpoint (no DB or API changes). The monolithic `pages-content-panel.tsx` is split into a `ReadablePanel` (Citation Audit + pages.md) and a `RecognizedPanel` (JSON-LD + Unfurl + Chatability) that share page-selection through a small context. A new `OverviewPanel` is the default landing tab. `Setup` houses llms.txt + AI Crawlers. Recommendable is a "coming soon" placeholder this phase.

**Tech Stack:** Next.js 16 (App Router), TypeScript, React, TanStack Query, Tailwind v4 + ShadCN, Vitest + React Testing Library.

**Source of truth:** [`docs/superpowers/specs/2026-06-01-ai-readiness-three-pillars-design.md`](../specs/2026-06-01-ai-readiness-three-pillars-design.md). Phase 1 scope only; Phases 2 & 3 are north-star context in the spec and are **not** implemented here.

**Resolved decisions baked into this plan (spec §9):**
- No composite score — three independent per-pillar **health scores**.
- Pillar "cleared" threshold for the stage sentence = **score ≥ 70** (reuses the existing `tierFor` "good" boundary).
- Pillar card labels reuse the existing tier vocabulary (`poor/fair/good/excellent`) via `tierFor`.
- **Recommendable** = "coming soon" placeholder (one seed check, no score shown).

**Pillar → check mapping (spec §5; weights from `rubric.ts`, sum to 100):**
- **Readable (AEO):** `answer-position`(15), `freshness`(8), `question-h2s`(7), `h1-present`(5), `heading-hierarchy`(5), `definitions`(5), `readability`(5), `internal-links`(5) — total 55
- **Recommendable (GEO):** `lists-tables`(5) — total 5
- **Recognized (AIO):** `schema-type`(10), `named-entities`(9), `entity-first-paragraph`(8), `schema-fields`(5), `meta-description`(5), `canonical`(3) — total 40

---

## File Structure

**New files**
- `src/lib/citation-audit/pillars.ts` — `Pillar` type, `PILLAR_OF` map, `PILLARS`, `pillarOf()`, `scorePillar()`.
- `src/lib/citation-audit/pillars.test.ts` — unit tests.
- `src/lib/citation-audit/site-readiness.ts` — `sitePillarScores()`, `pickNextAction()`, `stageStatus()`.
- `src/lib/citation-audit/site-readiness.test.ts` — unit tests.
- `src/lib/jsonld/generate.ts` — `generateJsonLd()` (extracted, lifted verbatim from the panel).
- `src/lib/jsonld/generate.test.ts` — unit tests.
- `src/lib/markdown/frontmatter-fields.ts` — `parseFrontmatterFieldsSafe()` (extracted verbatim).
- `src/lib/markdown/frontmatter-fields.test.ts` — unit tests.
- `src/lib/jsonld/highlight.ts` — `highlightJson()` (extracted verbatim).
- `src/components/generations/page-workspace-context.tsx` — provider sharing `{ generation, pages, manifestStatus, selectedPath, setSelectedPath }`.
- `src/components/generations/use-page-markdown.ts` — `usePageMarkdown(generationUid, path)` query hook.
- `src/components/generations/readable-panel.tsx` — Citation Audit + pages.md.
- `src/components/generations/readable-panel.test.tsx`
- `src/components/generations/recognized-panel.tsx` — JSON-LD + Unfurl + Chatability.
- `src/components/generations/recognized-panel.test.tsx`
- `src/components/generations/setup-panel.tsx` — llms.txt + AI Crawlers sub-tabs.
- `src/components/generations/setup-panel.test.tsx`
- `src/components/generations/coming-soon-panel.tsx` — Recommendable placeholder.
- `src/components/generations/overview-panel.tsx` — pillar cards + stage status + do-this-next.
- `src/components/generations/overview-panel.test.tsx`

**Modified files**
- `src/app/(app)/sites/[id]/site-detail-client.tsx` — new `tabItems`, default tab, content wiring, `PageWorkspaceProvider`, remove dead `CitationsTab` import.

**Deleted files**
- `src/components/generations/pages-content-panel.tsx` and `pages-content-panel.test.tsx` — replaced by `readable-panel` + `recognized-panel`.

---

## Group A — Pillar scoring library (pure logic, TDD)

### Task 1: Pillar map and per-pillar scoring

**Files:**
- Create: `src/lib/citation-audit/pillars.ts`
- Create: `src/lib/citation-audit/pillars.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/citation-audit/pillars.test.ts
import { describe, it, expect } from 'vitest';
import { PILLAR_OF, PILLARS, pillarOf, scorePillar } from './pillars';
import { RUBRIC } from './rubric';
import type { CheckResult } from './types';

function mk(id: string, score: number, weight: number): CheckResult {
  return { id, score, weight, passed: score >= 70, evidence: [], recommendation: null };
}

describe('pillars', () => {
  it('assigns every rubric check to exactly one pillar', () => {
    for (const entry of RUBRIC) {
      expect(PILLARS).toContain(PILLAR_OF[entry.id]);
    }
    expect(Object.keys(PILLAR_OF).length).toBe(RUBRIC.length);
  });

  it('pillar weight subtotals match the spec (55 / 5 / 40)', () => {
    const sum = (p: string) =>
      RUBRIC.filter((r) => PILLAR_OF[r.id] === p).reduce((a, r) => a + r.weight, 0);
    expect(sum('readable')).toBe(55);
    expect(sum('recommendable')).toBe(5);
    expect(sum('recognized')).toBe(40);
  });

  it('pillarOf returns undefined for unknown ids', () => {
    expect(pillarOf('nope')).toBeUndefined();
  });

  it('scorePillar weighted-aggregates only that pillar’s checks', () => {
    // readable has answer-position(15)=100 and h1-present(5)=0 → 100*15/(15+5)=75
    const checks = [mk('answer-position', 100, 15), mk('h1-present', 0, 5), mk('schema-type', 0, 10)];
    const r = scorePillar(checks, 'readable');
    expect(r.score).toBe(75);
    expect(r.tier).toBe('good');
  });

  it('scorePillar returns null when the pillar has no checks present', () => {
    expect(scorePillar([mk('schema-type', 100, 10)], 'readable')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/citation-audit/pillars.test.ts`
Expected: FAIL — cannot find module `./pillars`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/citation-audit/pillars.ts
import type { CheckResult, Tier } from './types';
import { aggregate } from './score';

export type Pillar = 'readable' | 'recommendable' | 'recognized';

export const PILLARS: readonly Pillar[] = ['readable', 'recommendable', 'recognized'] as const;

/** Maps each rubric check id to its pillar (spec §5). Weights live in rubric.ts. */
export const PILLAR_OF: Record<string, Pillar> = {
  // Readable (AEO)
  'answer-position': 'readable',
  'freshness': 'readable',
  'question-h2s': 'readable',
  'h1-present': 'readable',
  'heading-hierarchy': 'readable',
  'definitions': 'readable',
  'readability': 'readable',
  'internal-links': 'readable',
  // Recommendable (GEO)
  'lists-tables': 'recommendable',
  // Recognized (AIO)
  'schema-type': 'recognized',
  'named-entities': 'recognized',
  'entity-first-paragraph': 'recognized',
  'schema-fields': 'recognized',
  'meta-description': 'recognized',
  'canonical': 'recognized',
};

export function pillarOf(checkId: string): Pillar | undefined {
  return PILLAR_OF[checkId];
}

/** Weighted score for one pillar's checks within a page. Null if none present. */
export function scorePillar(
  checks: CheckResult[],
  pillar: Pillar,
): { score: number; tier: Tier } | null {
  const subset = checks.filter((c) => PILLAR_OF[c.id] === pillar);
  if (subset.length === 0) return null;
  return aggregate(subset);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/citation-audit/pillars.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/citation-audit/pillars.ts src/lib/citation-audit/pillars.test.ts
git commit -m "feat: add pillar map and per-pillar scoring for citation checks"
```

---

### Task 2: Site-level readiness rollup

**Files:**
- Create: `src/lib/citation-audit/site-readiness.ts`
- Create: `src/lib/citation-audit/site-readiness.test.ts`

This module consumes the latest audit per page (shape returned by `serializeCitationAudit`) and produces the three site health scores, a prioritized next action, and a plain-language stage sentence.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/citation-audit/site-readiness.test.ts
import { describe, it, expect } from 'vitest';
import { sitePillarScores, pickNextAction, stageStatus, type AuditLike } from './site-readiness';
import type { CheckResult } from './types';

function chk(id: string, score: number, weight: number, recommendation: string | null = null): CheckResult {
  return { id, score, weight, passed: score >= 70, evidence: [], recommendation };
}

function audit(pageUrl: string, checks: CheckResult[]): AuditLike {
  return { pageUrl, status: 'succeeded', results: { checks } };
}

describe('sitePillarScores', () => {
  it('averages each pillar score across pages', () => {
    const audits = [
      audit('https://x.com/', [chk('answer-position', 100, 15), chk('schema-type', 0, 10)]),
      audit('https://x.com/a', [chk('answer-position', 0, 15), chk('schema-type', 100, 10)]),
    ];
    const r = sitePillarScores(audits);
    expect(r.readable?.score).toBe(50); // (100 + 0) / 2
    expect(r.recognized?.score).toBe(50); // (0 + 100) / 2
    expect(r.recommendable).toBeNull(); // no lists-tables checks present
  });

  it('ignores failed audits and audits with no results', () => {
    const audits: AuditLike[] = [
      { pageUrl: 'https://x.com/', status: 'failed', results: null },
      audit('https://x.com/a', [chk('answer-position', 80, 15)]),
    ];
    expect(sitePillarScores(audits).readable?.score).toBe(80);
  });

  it('returns all-null when there are no usable audits', () => {
    const r = sitePillarScores([]);
    expect(r.readable).toBeNull();
    expect(r.recognized).toBeNull();
  });
});

describe('pickNextAction', () => {
  it('picks the highest-weight failing Readable/Recognized check', () => {
    const audits = [
      audit('https://x.com/a', [chk('h1-present', 0, 5, 'Add an H1'), chk('schema-type', 0, 10, 'Add schema')]),
    ];
    const next = pickNextAction(audits);
    expect(next?.checkId).toBe('schema-type'); // weight 10 > 5
    expect(next?.pillar).toBe('recognized');
    expect(next?.recommendation).toBe('Add schema');
    expect(next?.pageUrl).toBe('https://x.com/a');
  });

  it('prefers the index page on weight ties', () => {
    const audits = [
      audit('https://x.com/about', [chk('h1-present', 0, 5, 'Add H1 about')]),
      audit('https://x.com/', [chk('h1-present', 0, 5, 'Add H1 home')]),
    ];
    expect(pickNextAction(audits)?.pageUrl).toBe('https://x.com/');
  });

  it('ignores Recommendable checks this phase and returns null when nothing fails', () => {
    const audits = [audit('https://x.com/', [chk('lists-tables', 0, 5, 'Add a table'), chk('h1-present', 100, 5)])];
    expect(pickNextAction(audits)).toBeNull();
  });
});

describe('stageStatus', () => {
  it('flags when readable is below threshold', () => {
    expect(stageStatus({ readable: { score: 40, tier: 'poor' }, recognized: { score: 90, tier: 'excellent' }, recommendable: null }))
      .toMatch(/readable/i);
  });
  it('celebrates when both built pillars clear 70', () => {
    expect(stageStatus({ readable: { score: 80, tier: 'good' }, recognized: { score: 75, tier: 'good' }, recommendable: null }))
      .toMatch(/recommendable is coming soon/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/citation-audit/site-readiness.test.ts`
Expected: FAIL — cannot find module `./site-readiness`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/citation-audit/site-readiness.ts
import type { CheckResult, Tier } from './types';
import { tierFor } from './rubric';
import { PILLAR_OF, scorePillar, type Pillar } from './pillars';

/** Minimal shape we need from a serialized citation audit (see serialize.ts). */
export type AuditLike = {
  pageUrl: string;
  status: string;
  results: { checks: CheckResult[] } | null;
};

export type PillarScore = { score: number; tier: Tier };
export type SitePillarScores = Record<Pillar, PillarScore | null>;

const CLEARED = 70; // spec §9: a pillar is "cleared" at score >= 70

function usable(audits: AuditLike[]): { pageUrl: string; checks: CheckResult[] }[] {
  return audits
    .filter((a) => a.status === 'succeeded' && a.results)
    .map((a) => ({ pageUrl: a.pageUrl, checks: a.results!.checks }));
}

/** Site health per pillar = mean of per-page pillar scores (equal page weight). */
export function sitePillarScores(audits: AuditLike[]): SitePillarScores {
  const pages = usable(audits);
  const out = { readable: null, recommendable: null, recognized: null } as SitePillarScores;
  for (const pillar of ['readable', 'recommendable', 'recognized'] as Pillar[]) {
    const perPage = pages
      .map((p) => scorePillar(p.checks, pillar))
      .filter((s): s is PillarScore => s !== null);
    if (perPage.length === 0) continue;
    const mean = Math.round(perPage.reduce((a, s) => a + s.score, 0) / perPage.length);
    out[pillar] = { score: mean, tier: tierFor(mean) };
  }
  return out;
}

export type NextAction = {
  checkId: string;
  pillar: Pillar;
  pageUrl: string;
  weight: number;
  recommendation: string | null;
};

const PILLAR_ORDER: Record<Pillar, number> = { readable: 0, recommendable: 1, recognized: 2 };
const isIndex = (url: string): boolean => {
  try {
    return new URL(url).pathname.replace(/\/$/, '') === '';
  } catch {
    return false;
  }
};

/**
 * Highest-impact unresolved item across Readable + Recognized (Recommendable is
 * "coming soon" this phase). Sort: weight desc, then index page first, then pillar order.
 */
export function pickNextAction(audits: AuditLike[]): NextAction | null {
  const candidates: NextAction[] = [];
  for (const { pageUrl, checks } of usable(audits)) {
    for (const c of checks) {
      const pillar = PILLAR_OF[c.id];
      if (pillar !== 'readable' && pillar !== 'recognized') continue;
      if (c.passed) continue;
      candidates.push({ checkId: c.id, pillar, pageUrl, weight: c.weight, recommendation: c.recommendation });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    const ai = isIndex(a.pageUrl) ? 0 : 1;
    const bi = isIndex(b.pageUrl) ? 0 : 1;
    if (ai !== bi) return ai - bi;
    return PILLAR_ORDER[a.pillar] - PILLAR_ORDER[b.pillar];
  });
  return candidates[0];
}

/** Plain-language stage sentence (Phase 1: Recommendable is coming soon). */
export function stageStatus(scores: SitePillarScores): string {
  const readable = scores.readable?.score ?? 0;
  const recognized = scores.recognized?.score ?? 0;
  if (scores.readable === null) {
    return 'Run an audit to see how ready your site is for AI search.';
  }
  if (readable < CLEARED) {
    return 'Your pages aren’t fully readable to AI yet. Start here — clean structure and clear answers come first.';
  }
  if (recognized < CLEARED) {
    return 'Your site is Readable. Next: help AI recognize who you are.';
  }
  return 'Readable and Recognized — Recommendable is coming soon. You’re ahead of the curve.';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/citation-audit/site-readiness.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/citation-audit/site-readiness.ts src/lib/citation-audit/site-readiness.test.ts
git commit -m "feat: add site-level pillar rollup, next-action picker, stage status"
```

---

## Group B — Extract logic out of the monolith (pure, TDD)

These three pure functions currently live inside `pages-content-panel.tsx`. Extract them verbatim into tested modules so the panel split (Group D) just imports them. **Lift the function bodies exactly as written** from the referenced lines.

### Task 3: Extract `parseFrontmatterFieldsSafe`

**Files:**
- Create: `src/lib/markdown/frontmatter-fields.ts`
- Create: `src/lib/markdown/frontmatter-fields.test.ts`
- Source: `src/components/generations/pages-content-panel.tsx:705-755`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/markdown/frontmatter-fields.test.ts
import { describe, it, expect } from 'vitest';
import { parseFrontmatterFieldsSafe } from './frontmatter-fields';

describe('parseFrontmatterFieldsSafe', () => {
  it('parses --- delimited frontmatter into fields + body', () => {
    const md = '---\ntitle: Hello\nurl: https://x.com\n---\n# Body\ntext';
    const { fields, body } = parseFrontmatterFieldsSafe(md);
    expect(fields.title).toBe('Hello');
    expect(fields.url).toBe('https://x.com');
    expect(body).toBe('# Body\ntext');
  });

  it('falls back to blank-line split when no --- fence', () => {
    const { fields, body } = parseFrontmatterFieldsSafe('title: Hi\n\nBody here');
    expect(fields.title).toBe('Hi');
    expect(body).toBe('Body here');
  });

  it('returns whole string as body when no frontmatter', () => {
    expect(parseFrontmatterFieldsSafe('just text').body).toBe('just text');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/markdown/frontmatter-fields.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Create `src/lib/markdown/frontmatter-fields.ts` with an `export` of the `parseFrontmatterFieldsSafe` function copied **verbatim** from `pages-content-panel.tsx:705-755` (change `function parseFrontmatterFieldsSafe` → `export function parseFrontmatterFieldsSafe`). No logic changes.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/markdown/frontmatter-fields.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/markdown/frontmatter-fields.ts src/lib/markdown/frontmatter-fields.test.ts
git commit -m "refactor: extract parseFrontmatterFieldsSafe into tested lib module"
```

---

### Task 4: Extract `highlightJson`

**Files:**
- Create: `src/lib/jsonld/highlight.ts`
- Source: `src/components/generations/pages-content-panel.tsx:757-783`

- [ ] **Step 1: Move the function**

Create `src/lib/jsonld/highlight.ts` exporting `highlightJson` copied **verbatim** from lines 757-783 (`function highlightJson` → `export function highlightJson`). No test required — it's a presentational string transform covered indirectly by the JSON-LD generate tests and component tests.

- [ ] **Step 2: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/jsonld/highlight.ts
git commit -m "refactor: extract highlightJson into lib module"
```

---

### Task 5: Extract `generateJsonLd`

**Files:**
- Create: `src/lib/jsonld/generate.ts`
- Create: `src/lib/jsonld/generate.test.ts`
- Source: `src/components/generations/pages-content-panel.tsx:193-436`

The current `generateJsonLd` closes over `selectedPage` and `indexPageQuery.data`. Make those explicit parameters so the function is pure and testable.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/jsonld/generate.test.ts
import { describe, it, expect } from 'vitest';
import { generateJsonLd } from './generate';

describe('generateJsonLd', () => {
  it('produces WebPage JSON-LD for a generic page', () => {
    const out = generateJsonLd({
      fields: { title: 'About | Acme', url: 'https://acme.com/about', page_type: 'about' },
      selectedPageUrl: 'https://acme.com/about',
    });
    const parsed = JSON.parse(out);
    expect(parsed['@type']).toBe('AboutPage');
    expect(parsed.url).toBe('https://acme.com/about');
  });

  it('produces BlogPosting for blog page_type with dates', () => {
    const out = generateJsonLd({
      fields: { title: 'Post | Acme', url: 'https://acme.com/blog/x', page_type: 'blog', updated: '2026-01-01' },
      selectedPageUrl: 'https://acme.com/blog/x',
    });
    const parsed = JSON.parse(out);
    expect(parsed['@type']).toBe('BlogPosting');
    expect(parsed.dateModified).toBe('2026-01-01');
  });

  it('derives image from the markdown body when no image field', () => {
    const out = generateJsonLd({
      fields: { title: 'Acme', url: 'https://acme.com/', page_type: 'other' },
      body: '![alt](/hero.png)',
      selectedPageUrl: 'https://acme.com/',
    });
    expect(JSON.parse(out).image).toBe('https://acme.com/hero.png');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/jsonld/generate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

Create `src/lib/jsonld/generate.ts`. Copy the body of `generateJsonLd` from `pages-content-panel.tsx:193-436` **verbatim**, with these mechanical edits only:

```ts
// src/lib/jsonld/generate.ts
import { parseFrontmatterFieldsSafe } from '@/lib/markdown/frontmatter-fields';

export type GenerateJsonLdArgs = {
  fields: Record<string, string>;
  body?: string;
  /** URL of the page being rendered (was selectedPage?.url in the panel). */
  selectedPageUrl?: string;
  /** Raw markdown of the site's index page, used to resolve the publisher logo (was indexPageQuery.data). */
  indexMarkdown?: string | null;
};

export function generateJsonLd(args: GenerateJsonLdArgs): string {
  const { fields, body, selectedPageUrl, indexMarkdown } = args;
  // ... verbatim body from lines 193-436, with these substitutions:
  //   - `selectedPage?.url`        →  `selectedPageUrl`
  //   - `indexPageQuery.data`      →  `indexMarkdown`
  //   - the inline `parseFrontmatterFieldsSafe(indexPageQuery.data)` call uses the imported one
}
```

Do not change any of the type-mapping / brand-name / logo-resolution logic.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/jsonld/generate.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/jsonld/generate.ts src/lib/jsonld/generate.test.ts
git commit -m "refactor: extract generateJsonLd into a pure, tested lib module"
```

---

## Group C — Shared page workspace

### Task 6: Page workspace context + markdown hook

**Files:**
- Create: `src/components/generations/page-workspace-context.tsx`
- Create: `src/components/generations/use-page-markdown.ts`

Readable and Recognized both need the page manifest + a shared selected page. Lift that into a context. The markdown fetch is a hook both panels call (React Query dedupes by key).

- [ ] **Step 1: Write the context provider**

```tsx
// src/components/generations/page-workspace-context.tsx
'use client';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Generation } from '@/db/schema';
import type { ManifestPage } from './pages-tree';

type ManifestResponse =
  | { status: 'pending' | 'running'; pages: [] }
  | { status: 'succeeded' | 'cancelled'; pages: ManifestPage[]; successCount?: number; failedCount?: number; totalUrls?: number }
  | { status: 'skipped' | 'failed'; reason?: string; pages: [] };

type Ctx = {
  generation: Generation | null;
  pages: ManifestPage[];
  manifestPending: boolean;
  selectedPath: string | null;
  setSelectedPath: (path: string) => void;
};

const PageWorkspaceContext = createContext<Ctx | null>(null);

export function PageWorkspaceProvider({
  generation,
  children,
}: {
  generation: Generation | null;
  children: React.ReactNode;
}) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['pagesManifest', generation?.id, generation?.pagesStatus],
    enabled:
      !!generation &&
      (generation.pagesStatus === 'succeeded' || generation.pagesStatus === 'cancelled'),
    queryFn: async (): Promise<ManifestResponse> => {
      const res = await fetch(`/api/generations/${generation!.uid}/pages`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      return res.json() as Promise<ManifestResponse>;
    },
    staleTime: 30_000,
  });

  const manifest = q.data && 'pages' in q.data ? q.data : null;
  const pages = useMemo(() => (manifest?.pages ?? []) as ManifestPage[], [manifest?.pages]);

  // Default the selection to index (or first page) once the manifest arrives.
  useEffect(() => {
    if (pages.length === 0) return;
    const valid = selectedPath && pages.some((p) => p.path === selectedPath);
    if (valid) return;
    const hasIndex = pages.some((p) => p.path === 'index');
    setSelectedPath(hasIndex ? 'index' : (pages[0]?.path ?? null));
  }, [pages, selectedPath]);

  const value = useMemo<Ctx>(
    () => ({ generation, pages, manifestPending: q.isPending, selectedPath, setSelectedPath }),
    [generation, pages, q.isPending, selectedPath],
  );

  return <PageWorkspaceContext.Provider value={value}>{children}</PageWorkspaceContext.Provider>;
}

export function usePageWorkspace(): Ctx {
  const ctx = useContext(PageWorkspaceContext);
  if (!ctx) throw new Error('usePageWorkspace must be used within PageWorkspaceProvider');
  return ctx;
}
```

- [ ] **Step 2: Write the markdown hook**

```ts
// src/components/generations/use-page-markdown.ts
'use client';
import { useQuery } from '@tanstack/react-query';

export function usePageMarkdown(generationUid: string | undefined, path: string | null) {
  return useQuery({
    queryKey: ['pageMd', generationUid, path],
    enabled: !!generationUid && !!path,
    queryFn: async () => {
      const res = await fetch(`/api/generations/${generationUid}/pages/${path}?t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      return res.text();
    },
    staleTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm exec tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/generations/page-workspace-context.tsx src/components/generations/use-page-markdown.ts
git commit -m "feat: add shared page-workspace context and page-markdown hook"
```

---

## Group D — Split the monolith into Readable + Recognized

Both panels render `PagesTree` (from context) on the left and their sub-views on the right. They reuse existing child components: `CitationsPageDetail`, `PagesPreview`, `SchemaValidator`, `UnfurlPreview`, `PageQuestions`, `PagesTree`. Move the relevant JSX blocks from `pages-content-panel.tsx` into each panel.

### Task 7: ReadablePanel (Citation Audit + pages.md)

**Files:**
- Create: `src/components/generations/readable-panel.tsx`
- Create: `src/components/generations/readable-panel.test.tsx`
- Reference (move from): `pages-content-panel.tsx` — status guards `438-466`, tree `486-493`, Menubar shell `498-568` (keep only Citation Audit + pages.md + Export), Citation Audit `572-574`, pages.md block `575-608`, handlers `122-185`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/generations/readable-panel.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReadablePanel } from './readable-panel';
import { PageWorkspaceProvider } from './page-workspace-context';
import type { Generation } from '@/db/schema';

vi.mock('../citations/citations-page-detail', () => ({
  CitationsPageDetail: ({ pageUrl }: { pageUrl: string }) => <div>audit:{pageUrl}</div>,
}));

const gen = { id: 1, uid: 'gen-1', pagesStatus: 'succeeded' } as unknown as Generation;

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/pages?') || url.endsWith('/pages')) {
      return new Response(JSON.stringify({ status: 'succeeded', pages: [{ path: 'index', url: 'https://x.com/', status: 'ok' }] }), { status: 200 });
    }
    return new Response('---\ntitle: Home\n---\nbody', { status: 200 });
  }));
  return render(
    <QueryClientProvider client={client}>
      <PageWorkspaceProvider generation={gen}>
        <ReadablePanel siteId="site-1" />
      </PageWorkspaceProvider>
    </QueryClientProvider>,
  );
}

describe('ReadablePanel', () => {
  it('shows the Citation Audit sub-tab for the auto-selected index page', async () => {
    setup();
    expect(await screen.findByText('audit:https://x.com/')).toBeInTheDocument();
  });

  it('exposes a pages.md sub-tab trigger', async () => {
    setup();
    expect(await screen.findByText('pages.md')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/generations/readable-panel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement ReadablePanel**

Create `src/components/generations/readable-panel.tsx`. Structure:

```tsx
'use client';
import { useState } from 'react';
import { FileText, RefreshCw, Sparkles } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { TabPanel } from '@/components/layout/tab-panel';
import { PagesTree } from './pages-tree';
import { PagesPreview } from './pages-preview';
import { CitationsPageDetail } from '../citations/citations-page-detail';
import { Menubar, MenubarMenu, MenubarTrigger, MenubarContent, MenubarItem } from '@/components/ui/menubar';
import { usePageWorkspace } from './page-workspace-context';
import { usePageMarkdown } from './use-page-markdown';

export function ReadablePanel({ siteId }: { siteId: string }) {
  const { generation, pages, manifestPending, selectedPath, setSelectedPath } = usePageWorkspace();
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState<'citation-audit' | 'markdown'>('citation-audit');
  const [copyingState, setCopyingState] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const selectedPage = pages.find((p) => p.path === selectedPath);
  const markdownQuery = usePageMarkdown(generation?.uid, selectedPath);

  // Move handlers handleSavePage / handleExportAll / handleCopyMarkdown / handleRefresh /
  // handleFormatWithAi VERBATIM from pages-content-panel.tsx:122-185, replacing `selected`
  // with `selectedPath` and `generation!` guards as-is.

  // Status-guard early returns: copy from pages-content-panel.tsx:438-459 (the !generation /
  // pending / skipped / failed Placeholder blocks).

  // Render: TabPanel with PagesTree (onSelect={setSelectedPath}) on the left; on the right a
  // Menubar with ONLY: Citation Audit, pages.md, Export. Body:
  //   subTab==='citation-audit' -> <CitationsPageDetail siteUid={siteId} pageUrl={selectedPage.url} />
  //   subTab==='markdown'        -> the pages.md block from lines 575-608 (PagesPreview + actions)
}
```

Lift the JSX for the tree (486-493 → use `manifestPending` instead of `q.isPending`), the Menubar (498-568, drop the JSON-LD/Unfurl/Chatability `MenubarMenu` entries), the Citation Audit body (572-574), and the markdown body (575-608). Keep the `Placeholder` helper (copy lines 39-46) or import a shared one — copy it locally for now.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/generations/readable-panel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/generations/readable-panel.tsx src/components/generations/readable-panel.test.tsx
git commit -m "feat: add ReadablePanel (Citation Audit + pages.md) from page split"
```

---

### Task 8: RecognizedPanel (JSON-LD + Unfurl + Chatability)

**Files:**
- Create: `src/components/generations/recognized-panel.tsx`
- Create: `src/components/generations/recognized-panel.test.tsx`
- Reference (move from): `pages-content-panel.tsx` — JSON-LD block `609-667`, Unfurl block `668-685`, Chatability `686-688`, copy-JSON-LD handler `187-191`, `copiedJsonLd` state `62`, `indexPageQuery` `95-106`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/generations/recognized-panel.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecognizedPanel } from './recognized-panel';
import { PageWorkspaceProvider } from './page-workspace-context';
import type { Generation } from '@/db/schema';

vi.mock('../citations/page-questions', () => ({
  PageQuestions: ({ pageUrl }: { pageUrl: string }) => <div>questions:{pageUrl}</div>,
}));

const gen = { id: 1, uid: 'gen-1', pagesStatus: 'succeeded' } as unknown as Generation;

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/pages') || url.includes('/pages?')) {
      return new Response(JSON.stringify({ status: 'succeeded', pages: [{ path: 'index', url: 'https://x.com/', status: 'ok' }] }), { status: 200 });
    }
    return new Response('---\ntitle: Home\nurl: https://x.com/\npage_type: about\n---\nbody', { status: 200 });
  }));
  return render(
    <QueryClientProvider client={client}>
      <PageWorkspaceProvider generation={gen}>
        <RecognizedPanel siteId="site-1" />
      </PageWorkspaceProvider>
    </QueryClientProvider>,
  );
}

describe('RecognizedPanel', () => {
  it('renders JSON-LD, Unfurl Preview, and Chatability sub-tab triggers', async () => {
    setup();
    expect(await screen.findByText('JSON-LD')).toBeInTheDocument();
    expect(screen.getByText('Unfurl Preview')).toBeInTheDocument();
    expect(screen.getByText('Chatability')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/generations/recognized-panel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement RecognizedPanel**

Create `src/components/generations/recognized-panel.tsx` mirroring ReadablePanel's shell, but:
- default `subTab` = `'json-ld'`; Menubar entries: JSON-LD, Unfurl Preview, Chatability.
- import the extracted helpers: `import { generateJsonLd } from '@/lib/jsonld/generate'`, `import { highlightJson } from '@/lib/jsonld/highlight'`, `import { parseFrontmatterFieldsSafe } from '@/lib/markdown/frontmatter-fields'`.
- add the `indexPageQuery` (copy 95-106) so the JSON-LD logo resolution works; pass its data into `generateJsonLd` as `indexMarkdown`.
- JSON-LD body: lift 609-667 but replace the inline `generateJsonLd(fields, body)` call with `generateJsonLd({ fields, body, selectedPageUrl: selectedPage.url, indexMarkdown: indexPageQuery.data })`, and `highlightJson(...)` now comes from the import.
- Unfurl body: lift 668-685 (`UnfurlPreview` + `parseFrontmatterFieldsSafe`).
- Chatability body: `<PageQuestions siteId={siteId} pageUrl={selectedPage.url} />`.
- Reuse the same status-guard early returns and `PagesTree` left column as ReadablePanel.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/generations/recognized-panel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/generations/recognized-panel.tsx src/components/generations/recognized-panel.test.tsx
git commit -m "feat: add RecognizedPanel (JSON-LD + Unfurl + Chatability) from page split"
```

---

## Group E — Setup, Recommendable placeholder

### Task 9: ComingSoonPanel (Recommendable)

**Files:**
- Create: `src/components/generations/coming-soon-panel.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/generations/coming-soon-panel.tsx
import { Sparkles } from 'lucide-react';
import { TabPanel } from '@/components/layout/tab-panel';

export function ComingSoonPanel({ title, blurb }: { title: string; blurb: string }) {
  return (
    <TabPanel flat>
      <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
        <Sparkles className="h-8 w-8 text-muted-soft" aria-hidden="true" />
        <h3 className="display-sm text-ink mt-4">{title}</h3>
        <p className="mt-2 max-w-md text-base text-muted-strong">{blurb}</p>
      </div>
    </TabPanel>
  );
}
```

- [ ] **Step 2: Verify compile + commit**

Run: `pnpm exec tsc --noEmit` → no new errors.

```bash
git add src/components/generations/coming-soon-panel.tsx
git commit -m "feat: add reusable ComingSoonPanel placeholder"
```

---

### Task 10: SetupPanel (llms.txt + AI Crawlers)

**Files:**
- Create: `src/components/generations/setup-panel.tsx`
- Create: `src/components/generations/setup-panel.test.tsx`

Wraps the two existing components under sub-tabs.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/generations/setup-panel.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SetupPanel } from './setup-panel';
import type { Generation } from '@/db/schema';

vi.mock('./llms-content-panel', () => ({ LlmsContentPanel: () => <div>llms-panel</div> }));
vi.mock('../crawlers/crawler-audit-tab', () => ({ CrawlerAuditTab: () => <div>crawler-panel</div> }));

function setup() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <SetupPanel generation={{ uid: 'g1' } as unknown as Generation} siteId="s1" />
    </QueryClientProvider>,
  );
}

describe('SetupPanel', () => {
  it('shows llms.txt by default and switches to AI Crawlers', async () => {
    setup();
    expect(screen.getByText('llms-panel')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /ai crawlers/i }));
    expect(screen.getByText('crawler-panel')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/generations/setup-panel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// src/components/generations/setup-panel.tsx
'use client';
import { useState } from 'react';
import type { Generation } from '@/db/schema';
import { Menubar, MenubarMenu, MenubarTrigger } from '@/components/ui/menubar';
import { LlmsContentPanel } from './llms-content-panel';
import { CrawlerAuditTab } from '../crawlers/crawler-audit-tab';

export function SetupPanel({ generation, siteId }: { generation: Generation | null; siteId: string }) {
  const [tab, setTab] = useState<'llms' | 'crawlers'>('llms');
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center bg-[#f3efdb] p-1 rounded-lg border border-hairline w-full">
        <Menubar className="border-0 bg-transparent p-0 shadow-none">
          <MenubarMenu>
            <MenubarTrigger isActive={tab === 'llms'} onClick={() => setTab('llms')}>llms.txt</MenubarTrigger>
          </MenubarMenu>
          <MenubarMenu>
            <MenubarTrigger isActive={tab === 'crawlers'} onClick={() => setTab('crawlers')}>AI Crawlers</MenubarTrigger>
          </MenubarMenu>
        </Menubar>
      </div>
      {tab === 'llms' ? <LlmsContentPanel generation={generation} siteId={siteId} /> : <CrawlerAuditTab siteId={siteId} />}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/generations/setup-panel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/generations/setup-panel.tsx src/components/generations/setup-panel.test.tsx
git commit -m "feat: add SetupPanel grouping llms.txt and AI Crawlers"
```

---

## Group F — Overview

### Task 11: OverviewPanel

**Files:**
- Create: `src/components/generations/overview-panel.tsx`
- Create: `src/components/generations/overview-panel.test.tsx`

Fetches `/api/sites/{siteId}/citation-audits/latest`, computes pillar scores + next action + stage status, renders three pillar cards (Recommendable = coming soon), the stage sentence, and the "Do this next" card. Accepts an `onNavigate(tab)` callback so the cards/CTA can switch the parent tab.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/generations/overview-panel.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OverviewPanel } from './overview-panel';

function renderWithLatest(audits: unknown[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ audits }), { status: 200 })));
  const onNavigate = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <OverviewPanel siteId="s1" onNavigate={onNavigate} />
    </QueryClientProvider>,
  );
  return { onNavigate };
}

const mkAudit = (pageUrl: string, checks: unknown[]) => ({ pageUrl, status: 'succeeded', score: 50, tier: 'fair', results: { checks } });

describe('OverviewPanel', () => {
  it('shows the three pillar cards with Recommendable as coming soon', async () => {
    renderWithLatest([mkAudit('https://x.com/', [{ id: 'answer-position', passed: true, score: 100, weight: 15, evidence: [], recommendation: null }])]);
    expect(await screen.findByText(/readable/i)).toBeInTheDocument();
    expect(screen.getByText(/recognized/i)).toBeInTheDocument();
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it('surfaces the highest-weight failing check as Do this next and navigates on click', async () => {
    const { onNavigate } = renderWithLatest([
      mkAudit('https://x.com/', [{ id: 'schema-type', passed: false, score: 0, weight: 10, evidence: [], recommendation: 'Add schema' }]),
    ]);
    expect(await screen.findByText(/do this next/i)).toBeInTheDocument();
    expect(screen.getByText('Add schema')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /show me how/i }));
    expect(onNavigate).toHaveBeenCalledWith('recognized');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/generations/overview-panel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// src/components/generations/overview-panel.tsx
'use client';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Sparkles } from 'lucide-react';
import { TabPanel } from '@/components/layout/tab-panel';
import {
  sitePillarScores, pickNextAction, stageStatus, type AuditLike,
} from '@/lib/citation-audit/site-readiness';
import type { Pillar } from '@/lib/citation-audit/pillars';

const CHECK_LABEL: Record<string, string> = {
  'h1-present': 'H1 present', 'heading-hierarchy': 'Heading hierarchy clean',
  'meta-description': 'Meta description', 'canonical': 'Canonical tag',
  'schema-type': 'Schema.org type', 'schema-fields': 'Required schema fields',
  'answer-position': 'Answer in first 100 words', 'entity-first-paragraph': 'Entity in first paragraph',
  'question-h2s': 'Question-style H2s', 'lists-tables': 'Lists or tables present',
  'definitions': 'Definition pattern in opening', 'freshness': 'Recently updated',
  'readability': 'Reading level grade 8-10', 'named-entities': 'Named entities disambiguated',
  'internal-links': 'Internal links to related pages',
};

const PILLAR_TAB: Record<Pillar, string> = { readable: 'readable', recommendable: 'recommendable', recognized: 'recognized' };

export function OverviewPanel({ siteId, onNavigate }: { siteId: string; onNavigate: (tab: string) => void }) {
  const latest = useQuery({
    queryKey: ['citation-audits', 'latest', siteId],
    queryFn: async (): Promise<{ audits: AuditLike[] }> => {
      const res = await fetch(`/api/sites/${siteId}/citation-audits/latest`);
      if (!res.ok) throw new Error('Failed to load readiness');
      return res.json();
    },
  });

  const audits = latest.data?.audits ?? [];
  const scores = sitePillarScores(audits);
  const next = pickNextAction(audits);
  const status = stageStatus(scores);

  // Render (concrete structure — match DESIGN.md tokens, no drop shadows):
  // 1. Stage status sentence (status) in a prominent text block.
  // 2. "Do this next" card when `next` is non-null: label = CHECK_LABEL[next.checkId],
  //    recommendation text, page URL, and a Button "Show me how" -> onNavigate(PILLAR_TAB[next.pillar]).
  //    When next is null and audits exist: "You're all caught up on the basics."
  // 3. Three pillar cards in a responsive grid:
  //    - Readable:  scores.readable  (score + tier label, click -> onNavigate('readable'))
  //    - Recommendable: always "Coming soon" (no score), non-clickable
  //    - Recognized: scores.recognized (score + tier label, click -> onNavigate('recognized'))
  //    A null score renders as "—  Run an audit".
  // Use bg-surface-card, border-hairline, text-ink/body tokens.

  return (
    <TabPanel flat>
      {/* ...implement the three sections above; show latest.isPending as a "Loading readiness…" state... */}
    </TabPanel>
  );
}
```

Implement the JSX for the three sections per the inline comments. Pillar card score color: green when `score >= 70`, amber when `>= 50`, red otherwise — reuse Tailwind `text-semantic-success` / `text-primary-base` / `text-destructive`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/components/generations/overview-panel.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/generations/overview-panel.tsx src/components/generations/overview-panel.test.tsx
git commit -m "feat: add OverviewPanel with pillar health scores and do-this-next"
```

---

## Group G — Wire the new tab shell

### Task 12: Reframe `site-detail-client.tsx`

**Files:**
- Modify: `src/app/(app)/sites/[id]/site-detail-client.tsx`

- [ ] **Step 1: Update imports**

Remove the dead `CitationsTab` import (line 15). Remove the `PagesContentPanel` import (line 11) and `CrawlerAuditTab` import (line 14 — now used only inside SetupPanel). Add:

```tsx
import { OverviewPanel } from '@/components/generations/overview-panel';
import { ReadablePanel } from '@/components/generations/readable-panel';
import { RecognizedPanel } from '@/components/generations/recognized-panel';
import { SetupPanel } from '@/components/generations/setup-panel';
import { ComingSoonPanel } from '@/components/generations/coming-soon-panel';
import { PageWorkspaceProvider } from '@/components/generations/page-workspace-context';
```

Keep the `LlmsContentPanel` import only if still referenced elsewhere; it now lives inside `SetupPanel`, so remove it from this file.

- [ ] **Step 2: Update `tabItems` and default tab**

```tsx
const tabItems = [
  { value: 'overview', label: 'Overview' },
  { value: 'readable', label: 'Readable' },
  { value: 'recommendable', label: 'Recommendable' },
  { value: 'recognized', label: 'Recognized' },
  { value: 'setup', label: 'Setup', isSetup: true },
];
```

Change `useState('pages')` (line 37) → `useState('overview')`.

- [ ] **Step 3: Swap the TabsContent block**

Replace lines 313-321 with:

```tsx
<TabsContent value="overview" className="mt-0 outline-none">
  <OverviewPanel siteId={site.uid} onNavigate={setActiveTab} />
</TabsContent>
<TabsContent value="readable" className="mt-0 outline-none">
  <ReadablePanel siteId={site.uid} />
</TabsContent>
<TabsContent value="recommendable" className="mt-0 outline-none">
  <ComingSoonPanel
    title="Recommendable is coming soon"
    blurb="Next, we'll check whether AI has the evidence to recommend you — pricing, comparisons, and proof with real numbers."
  />
</TabsContent>
<TabsContent value="recognized" className="mt-0 outline-none">
  <RecognizedPanel siteId={site.uid} />
</TabsContent>
<TabsContent value="setup" className="mt-0 outline-none">
  <SetupPanel generation={selected} siteId={site.uid} />
</TabsContent>
```

- [ ] **Step 4: Wrap pillar tabs in the workspace provider**

Wrap the `<Tabs>` element (line 155) so Readable/Recognized share page selection. Add `<PageWorkspaceProvider generation={selected}>` immediately inside the outer wrapper `<div>` (line 151) around the `<Tabs>`, and close it after `</Tabs>`.

- [ ] **Step 5: Run the full test suite + typecheck**

Run: `pnpm exec tsc --noEmit && pnpm test`
Expected: all pass. The old `pages-content-panel.test.tsx` still exists at this point — leave it until Task 13.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/sites/[id]/site-detail-client.tsx"
git commit -m "feat: reframe site detail tabs into Overview/Readable/Recommendable/Recognized/Setup"
```

---

### Task 13: Delete the replaced monolith

**Files:**
- Delete: `src/components/generations/pages-content-panel.tsx`
- Delete: `src/components/generations/pages-content-panel.test.tsx`

- [ ] **Step 1: Confirm no remaining importers**

Run: `grep -rn "pages-content-panel\|PagesContentPanel" src`
Expected: no matches.

- [ ] **Step 2: Delete the files**

```bash
git rm src/components/generations/pages-content-panel.tsx src/components/generations/pages-content-panel.test.tsx
```

- [ ] **Step 3: Run tests + build**

Run: `pnpm test && pnpm build`
Expected: all tests pass; build succeeds.

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor: remove pages-content-panel superseded by Readable/Recognized split"
```

---

## Group H — Visual verification & Setup styling

### Task 14: Setup tab divider + muted styling

**Files:**
- Modify: `src/app/(app)/sites/[id]/site-detail-client.tsx` (the custom folder-tab trigger render, ~lines 293-309)

The `isSetup` flag added in Task 12 drives a calmer treatment.

- [ ] **Step 1: Apply muted styling to the Setup trigger**

In the `tabItems.map` that renders `TabsTrigger` (around line 294), append to the `className`:

```tsx
item.isSetup && 'opacity-70',
```

and render a divider before the Setup trigger:

```tsx
{item.isSetup && <span aria-hidden className="self-center mx-1 h-5 w-px bg-hairline-strong" />}
```

(Place the divider as a sibling immediately before the `<TabsTrigger>` inside the map, guarded by `item.isSetup`.)

- [ ] **Step 2: Verify in the preview**

Start the dev server (`preview_start` name `dev`), navigate to `/sites/<uid>`, and confirm: five tabs render, Overview is default, the Setup tab is visually separated and muted, and the folder-tab corner rounding still looks correct. Take a screenshot.

Note: the animated folder-tab background (lines 255-287) assumes equal-flex tabs; with five tabs it should still distribute. If the active-tab highlight misaligns, adjust the flex basis — but do not block the commit on pixel polish; capture any issue as a follow-up.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/sites/[id]/site-detail-client.tsx"
git commit -m "style: set off the Setup tab with a divider and muted weight"
```

---

### Task 15: End-to-end preview smoke test

- [ ] **Step 1: Exercise the flow in the preview**

With the dev server running and a site that has a succeeded generation:
1. Overview loads, shows three pillar cards (Recommendable = coming soon) and a stage sentence.
2. If a page has failing checks, a "Do this next" card appears; clicking "Show me how" switches to the right pillar tab.
3. Readable tab: page tree + Citation Audit + pages.md sub-tabs work; selecting a page persists when switching to Recognized.
4. Recognized tab: JSON-LD renders + validates, Unfurl preview renders, Chatability loads.
5. Setup tab: llms.txt and AI Crawlers sub-tabs both work.

Capture a screenshot of the Overview and confirm no console errors via `preview_console_logs`.

- [ ] **Step 2: Final full verification**

Run: `pnpm lint && pnpm test && pnpm build`
Expected: clean lint, all tests pass, successful build.

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: address Phase 1 readiness reframe smoke-test findings"
```

(Skip if nothing needed fixing.)

---

## Self-Review

**Spec coverage:**
- IA `Overview · Readable · Recommendable · Recognized · Setup` → Task 12. ✅
- Setup ordered last, divider + muted → Task 14. ✅
- Overview: per-pillar health scores + stage status + one "Do this next" → Tasks 2, 11. ✅
- No composite score (three independent scores) → Task 2 (`sitePillarScores` returns per-pillar) + Task 11 rendering. ✅
- Recommendable = "coming soon" → Tasks 9, 12. ✅
- Check re-bucketing into pillars → Task 1 (`PILLAR_OF`, subtotals 55/5/40). ✅
- Readable = Citation Audit + pages.md → Task 7. ✅
- Recognized = JSON-LD + Unfurl + Chatability → Task 8. ✅
- Setup = llms.txt + AI Crawlers → Task 10. ✅
- Client-side scoring from existing `latest` endpoint (no DB/API change) → Tasks 2, 11. ✅
- Prioritization (weight × stage × index page) → Task 2 (`pickNextAction`). ✅
- Stage threshold ≥70, tier labels → Task 2 (`CLEARED`, `tierFor`). ✅
- Dead `CitationsTab` import removed → Task 12. ✅

**Placeholder scan:** UI panel tasks (7, 8, 11) reference exact source line ranges to relocate rather than re-pasting ~250 lines of existing JSX — this is deliberate for a refactor and each names the precise block, props, and substitutions. Pure-logic and new-wiring tasks contain complete code. No `TBD`/`handle edge cases`/vague steps.

**Type consistency:** `Pillar`, `PillarScore`, `SitePillarScores`, `AuditLike`, `NextAction` are defined in Tasks 1–2 and consumed unchanged in Task 11. `usePageWorkspace()` returns `{ generation, pages, manifestPending, selectedPath, setSelectedPath }` (Task 6) and is consumed identically in Tasks 7–8. `generateJsonLd` takes the `GenerateJsonLdArgs` object form (Task 5) and is called that way in Task 8. `onNavigate(tab: string)` (Task 11) is wired to `setActiveTab` (Task 12). ✅

**Known risk (flagged, not a blocker):** This branch is off `main`; the unmerged cleanup PR also rewrites `site-detail-client.tsx` (LazyMotion + SSE). Expect a mechanical merge conflict in the tab shell when that PR lands. The reframe is behavior-orthogonal to the perf work.
