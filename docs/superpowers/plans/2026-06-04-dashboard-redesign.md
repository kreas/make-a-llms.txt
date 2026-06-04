# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the thin site-card dashboard with a sidebar app shell and an analytics dashboard (stat cards, audit-url strip, Monitored Websites table) scored on the Readable/Recommendable/Recognized pillars.

**Architecture:** Pure aggregation functions (`lib/services/dashboard.ts`, plus two helpers in `lib/citation-audit/site-readiness.ts`) compute everything from already-fetched rows and are unit-tested without a DB. A thin server-side loader does batched Drizzle queries and feeds the pure functions. The `/dashboard` page stays an async Server Component and renders presentational components. A new client sidebar shell wraps all `(app)` routes.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript, Drizzle/libsql, Tailwind v4 + DESIGN.md tokens, Vitest + React Testing Library. Sparkline is hand-rolled inline SVG (no chart lib needed).

**Spec:** `docs/superpowers/specs/2026-06-04-dashboard-redesign-design.md`

---

## File Structure

**Create**
- `src/lib/services/dashboard.ts` — pure `buildDashboardData` + `buildReadinessTrend` + types, and thin `loadDashboardData(userId)` loader.
- `src/lib/services/dashboard.test.ts` — pure-function tests.
- `src/lib/services/dashboard.loader.test.ts` — loader test against `setupTestDb`.
- `src/components/layout/app-sidebar.tsx` (+ `.test.tsx`)
- `src/components/layout/app-shell.tsx` (+ `.test.tsx`)
- `src/components/dashboard/stat-card.tsx` (+ `.test.tsx`)
- `src/components/dashboard/readiness-sparkline.tsx` (+ `.test.tsx`)
- `src/components/dashboard/audit-url-strip.tsx` (+ `.test.tsx`)
- `src/components/dashboard/sites-table.tsx` (+ `.test.tsx`)
- `src/components/dashboard/sites-table-row.tsx` (+ `.test.tsx`)

**Modify**
- `src/lib/citation-audit/site-readiness.ts` — add `compositeScore` + `failingCheckCount`.
- `src/lib/citation-audit/site-readiness.test.ts` — add tests for the two helpers.
- `src/app/(app)/layout.tsx` — swap header/footer for `AppShell`.
- `src/app/(app)/dashboard/page.tsx` — load aggregates, render new components.
- `src/app/(app)/sites/new/page.tsx` — read `?url=` and prefill.
- `src/components/sites/site-form.tsx` — accept optional `initialUrl`.

**Delete** (after the page stops importing them — Task 14)
- `src/components/sites/sites-list.tsx` + `.test.tsx`
- `src/components/sites/site-card.tsx` + `.test.tsx`

(`AddSiteCard` is kept and reused for the zero-sites empty state.)

---

## Task 1: Composite score + failing-check count helpers

**Files:**
- Modify: `src/lib/citation-audit/site-readiness.ts`
- Test: `src/lib/citation-audit/site-readiness.test.ts`

- [ ] **Step 1: Write the failing tests** — append to `site-readiness.test.ts`:

```ts
import { compositeScore, failingCheckCount } from './site-readiness';

describe('compositeScore', () => {
  it('averages the non-null pillar scores', () => {
    expect(
      compositeScore({
        readable: { score: 80, tier: 'good' },
        recommendable: { score: 40, tier: 'poor' },
        recognized: { score: 90, tier: 'excellent' },
      }),
    ).toBe(70); // (80 + 40 + 90) / 3
  });

  it('ignores pillars that have not been scored', () => {
    expect(
      compositeScore({
        readable: { score: 80, tier: 'good' },
        recommendable: null,
        recognized: { score: 60, tier: 'fair' },
      }),
    ).toBe(70); // (80 + 60) / 2
  });

  it('returns null when no pillar has been scored', () => {
    expect(compositeScore({ readable: null, recommendable: null, recognized: null })).toBeNull();
  });
});

describe('failingCheckCount', () => {
  it('counts failing per-page checks plus failing GEO signals', () => {
    const audits = [
      audit('https://x.com/', [chk('h1-present', 0, 5), chk('answer-position', 100, 15)]),
      audit('https://x.com/a', [chk('schema-type', 0, 10)]),
    ];
    const g = geo(0, [
      { signal: 'pricing', weight: 40, present: false, artifacts: [], pages: [], recommendation: 'x' },
      { signal: 'comparison', weight: 30, present: true, artifacts: [], pages: [], recommendation: null },
    ]);
    expect(failingCheckCount(audits, g)).toBe(3); // 2 failing checks + 1 failing signal
  });

  it('counts zero when everything passes and no GEO audit exists', () => {
    expect(failingCheckCount([audit('https://x.com/', [chk('h1-present', 100, 5)])], null)).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `pnpm test src/lib/citation-audit/site-readiness.test.ts`
  Expected: FAIL — `compositeScore`/`failingCheckCount` not exported.

- [ ] **Step 3: Implement** — append to `site-readiness.ts`:

```ts
/** Mean of the pillar scores that have actually been scored; null if none have. */
export function compositeScore(scores: SitePillarScores): number | null {
  const present = (['readable', 'recommendable', 'recognized'] as Pillar[])
    .map((p) => scores[p])
    .filter((s): s is PillarScore => s !== null);
  if (present.length === 0) return null;
  return Math.round(present.reduce((a, s) => a + s.score, 0) / present.length);
}

/** Total unresolved items: failing per-page checks + failing GEO signals. */
export function failingCheckCount(
  audits: AuditLike[],
  geo: SiteGeoAuditResult | null = null,
): number {
  let n = 0;
  for (const { checks } of usable(audits)) {
    for (const c of checks) if (!c.passed) n += 1;
  }
  if (geo) n += geo.signals.filter((s) => !s.present).length;
  return n;
}
```

- [ ] **Step 4: Run to verify pass** — Run: `pnpm test src/lib/citation-audit/site-readiness.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/citation-audit/site-readiness.ts src/lib/citation-audit/site-readiness.test.ts
git commit -m "feat: compositeScore and failingCheckCount site-readiness helpers"
```

---

## Task 2: Dashboard pure aggregation

**Files:**
- Create: `src/lib/services/dashboard.ts`
- Test: `src/lib/services/dashboard.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/services/dashboard.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildDashboardData, type DashboardInput } from './dashboard';
import type { Site } from '@/db/schema';
import type { AuditLike } from '@/lib/citation-audit/site-readiness';

function site(id: number, name: string): Site {
  return {
    id, uid: `uid-${id}`, userId: 1, name, rootUrl: `https://${name}`,
    sitemapUrl: null, webhookTokenHash: 'h', webhookTokenPrefix: 'p',
    displayName: null, description: null, faviconUrl: null, siteType: null,
    geoGoal: null, metadataFetchedAt: null, lastGeneratedAt: null,
    createdAt: '2026-01-01', updatedAt: '2026-01-01',
  } as Site;
}
function ok(pageUrl: string, checks: AuditLike['results']): AuditLike {
  return { pageUrl, status: 'succeeded', results: checks };
}

describe('buildDashboardData', () => {
  const input: DashboardInput = {
    sites: [site(1, 'a.com'), site(2, 'b.com')],
    auditsBySiteId: {
      1: [ok('https://a.com/', { checks: [
        { id: 'answer-position', passed: true, score: 80, weight: 15, evidence: [], recommendation: null },
        { id: 'h1-present', passed: false, score: 0, weight: 5, evidence: [], recommendation: 'Add H1' },
      ] })],
      2: [],
    },
    geoBySiteId: { 1: null, 2: null },
    lastAuditedBySiteId: { 1: '2026-06-01T00:00:00Z', 2: null },
    auditedThisWeek: 1,
    trendPoints: [],
  };

  it('builds one row per site with composite, issues and nextAction', () => {
    const data = buildDashboardData(input);
    expect(data.rows).toHaveLength(2);
    const a = data.rows.find((r) => r.site.id === 1)!;
    expect(a.scores.readable?.score).toBe(80);
    expect(a.composite).toBe(80); // only readable scored
    expect(a.issues).toBe(1);
    expect(a.nextAction?.checkId).toBe('h1-present');
    expect(a.audited).toBe(true);
    const b = data.rows.find((r) => r.site.id === 2)!;
    expect(b.audited).toBe(false);
    expect(b.composite).toBeNull();
  });

  it('computes stats across sites', () => {
    const data = buildDashboardData(input);
    expect(data.stats.sitesMonitored).toBe(2);
    expect(data.stats.auditedThisWeek).toBe(1);
    expect(data.stats.avgReadiness).toBe(80); // only site 1 has a composite
    expect(data.stats.openIssues).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `pnpm test src/lib/services/dashboard.test.ts`
  Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `src/lib/services/dashboard.ts` (pure parts only for now):

```ts
import type { Site } from '@/db/schema';
import type { SiteGeoAuditResult } from '@/lib/geo-audit/types';
import {
  sitePillarScores,
  compositeScore,
  failingCheckCount,
  pickNextAction,
  type AuditLike,
  type SitePillarScores,
  type NextAction,
} from '@/lib/citation-audit/site-readiness';

export type DashboardSiteRow = {
  site: Site;
  scores: SitePillarScores;
  composite: number | null;
  issues: number;
  nextAction: NextAction | null;
  lastAuditedAt: string | null;
  audited: boolean;
};

export type DashboardStats = {
  sitesMonitored: number;
  auditedThisWeek: number;
  avgReadiness: number | null;
  avgReadinessDelta: number | null;
  openIssues: number;
};

export type DashboardData = {
  rows: DashboardSiteRow[];
  stats: DashboardStats;
  trend: number[] | null;
};

export type DashboardInput = {
  sites: Site[];
  auditsBySiteId: Record<number, AuditLike[]>;
  geoBySiteId: Record<number, SiteGeoAuditResult | null>;
  lastAuditedBySiteId: Record<number, string | null>;
  auditedThisWeek: number;
  trendPoints: { day: string; score: number }[];
};

export function buildDashboardData(input: DashboardInput): DashboardData {
  const rows: DashboardSiteRow[] = input.sites.map((site) => {
    const audits = input.auditsBySiteId[site.id] ?? [];
    const geo = input.geoBySiteId[site.id] ?? null;
    const scores = sitePillarScores(audits, geo);
    const usable = audits.some((a) => a.status === 'succeeded' && a.results);
    return {
      site,
      scores,
      composite: compositeScore(scores),
      issues: failingCheckCount(audits, geo),
      nextAction: pickNextAction(audits, geo),
      lastAuditedAt: input.lastAuditedBySiteId[site.id] ?? null,
      audited: usable,
    };
  });

  const composites = rows.map((r) => r.composite).filter((c): c is number => c !== null);
  const avgReadiness =
    composites.length > 0
      ? Math.round(composites.reduce((a, c) => a + c, 0) / composites.length)
      : null;
  const trend = buildReadinessTrend(input.trendPoints);
  const avgReadinessDelta =
    trend && trend.length >= 2 ? Math.round(trend[trend.length - 1] - trend[0]) : null;

  return {
    rows,
    stats: {
      sitesMonitored: input.sites.length,
      auditedThisWeek: input.auditedThisWeek,
      avgReadiness,
      avgReadinessDelta,
      openIssues: rows.reduce((a, r) => a + r.issues, 0),
    },
    trend,
  };
}

/** Daily-bucketed average of page audit scores, newest last. Null if < 2 buckets. */
export function buildReadinessTrend(points: { day: string; score: number }[]): number[] | null {
  if (points.length === 0) return null;
  const byDay = new Map<string, { sum: number; n: number }>();
  for (const p of points) {
    const b = byDay.get(p.day) ?? { sum: 0, n: 0 };
    b.sum += p.score;
    b.n += 1;
    byDay.set(p.day, b);
  }
  const days = [...byDay.keys()].sort();
  if (days.length < 2) return null;
  return days.slice(-7).map((d) => {
    const b = byDay.get(d)!;
    return Math.round(b.sum / b.n);
  });
}
```

- [ ] **Step 4: Run to verify pass** — Run: `pnpm test src/lib/services/dashboard.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/dashboard.ts src/lib/services/dashboard.test.ts
git commit -m "feat: pure dashboard aggregation (buildDashboardData)"
```

---

## Task 3: Readiness trend builder tests

**Files:**
- Modify: `src/lib/services/dashboard.test.ts`

- [ ] **Step 1: Add tests** for `buildReadinessTrend`:

```ts
import { buildReadinessTrend } from './dashboard';

describe('buildReadinessTrend', () => {
  it('returns null with fewer than two distinct days', () => {
    expect(buildReadinessTrend([])).toBeNull();
    expect(buildReadinessTrend([{ day: '2026-06-01', score: 80 }])).toBeNull();
  });

  it('averages per day and keeps the last 7 days in order', () => {
    const pts = [
      { day: '2026-06-01', score: 60 },
      { day: '2026-06-01', score: 80 }, // avg 70
      { day: '2026-06-02', score: 90 },
    ];
    expect(buildReadinessTrend(pts)).toEqual([70, 90]);
  });
});
```

- [ ] **Step 2: Run** — Run: `pnpm test src/lib/services/dashboard.test.ts`
  Expected: PASS (implementation already exists from Task 2).

- [ ] **Step 3: Commit**

```bash
git add src/lib/services/dashboard.test.ts
git commit -m "test: buildReadinessTrend bucketing and fallback"
```

---

## Task 4: Dashboard loader (batched DB queries)

**Files:**
- Modify: `src/lib/services/dashboard.ts` (add `loadDashboardData`)
- Test: `src/lib/services/dashboard.loader.test.ts`

Notes: reuse the latest-citation-audit-per-page dedup logic from
`src/app/api/sites/[id]/citation-audits/latest/route.ts` (most recent row wins
per `pageUrl`). GEO: latest `siteGeoAudits` row per site with `status === 'succeeded'`.
Parse stored JSON (`results`) into `AuditLike` / `SiteGeoAuditResult`.

- [ ] **Step 1: Write the failing test** — `src/lib/services/dashboard.loader.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDb, resetTestDb, type TestDb } from '@/test/db';
import { users, sites, citationAudits } from '@/db/schema';
import { loadDashboardData } from './dashboard';

let db: TestDb;
beforeEach(async () => { db = await setupTestDb(); });
afterEach(() => resetTestDb());

describe('loadDashboardData', () => {
  it('aggregates per-site scores and stats for a user', async () => {
    const [u] = await db.insert(users).values({ name: 'T', email: 't@x.com' }).returning();
    const [s] = await db.insert(sites).values({
      userId: u.id, name: 'a.com', rootUrl: 'https://a.com',
      webhookTokenHash: 'h', webhookTokenPrefix: 'p',
    }).returning();
    await db.insert(citationAudits).values({
      siteId: s.id, pageUrl: 'https://a.com/', status: 'succeeded', score: 80, tier: 'good',
      trigger: 'manual',
      results: JSON.stringify({ checks: [
        { id: 'answer-position', passed: true, score: 80, weight: 15, evidence: [], recommendation: null },
        { id: 'h1-present', passed: false, score: 0, weight: 5, evidence: [], recommendation: 'Add H1' },
      ] }),
    });

    const data = await loadDashboardData(u.id);
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0].scores.readable?.score).toBe(80);
    expect(data.rows[0].issues).toBe(1);
    expect(data.stats.sitesMonitored).toBe(1);
    expect(data.stats.openIssues).toBe(1);
  });

  it('returns empty rows and null avg for a user with no sites', async () => {
    const [u] = await db.insert(users).values({ name: 'E', email: 'e@x.com' }).returning();
    const data = await loadDashboardData(u.id);
    expect(data.rows).toHaveLength(0);
    expect(data.stats.avgReadiness).toBeNull();
    expect(data.trend).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `pnpm test src/lib/services/dashboard.loader.test.ts`
  Expected: FAIL — `loadDashboardData` not exported.

- [ ] **Step 3: Implement** — append to `src/lib/services/dashboard.ts`:

```ts
import { desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { sites as sitesTable, citationAudits, siteGeoAudits } from '@/db/schema';
import type { CheckResult } from '@/lib/citation-audit/types';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function loadDashboardData(userId: number): Promise<DashboardData> {
  const db = getDb();
  const userSites = await db.select().from(sitesTable).where(eq(sitesTable.userId, userId));
  const siteIds = userSites.map((s) => s.id);

  const auditsBySiteId: Record<number, AuditLike[]> = {};
  const geoBySiteId: Record<number, SiteGeoAuditResult | null> = {};
  const lastAuditedBySiteId: Record<number, string | null> = {};
  const trendPoints: { day: string; score: number }[] = [];
  let auditedThisWeek = 0;
  for (const id of siteIds) {
    auditsBySiteId[id] = [];
    geoBySiteId[id] = null;
    lastAuditedBySiteId[id] = null;
  }

  if (siteIds.length > 0) {
    const rows = await db
      .select()
      .from(citationAudits)
      .where(inArray(citationAudits.siteId, siteIds))
      .orderBy(desc(citationAudits.fetchedAt));

    const seenPage = new Map<number, Set<string>>(); // siteId -> pageUrls already taken (latest)
    const auditedSitesThisWeek = new Set<number>();
    const weekAgo = Date.now() - WEEK_MS;
    for (const r of rows) {
      // Trend: every succeeded audit with a numeric score contributes a daily point.
      if (r.status === 'succeeded' && typeof r.score === 'number') {
        trendPoints.push({ day: r.fetchedAt.slice(0, 10), score: r.score });
      }
      if (new Date(r.fetchedAt).getTime() >= weekAgo) auditedSitesThisWeek.add(r.siteId);
      if (lastAuditedBySiteId[r.siteId] === null) lastAuditedBySiteId[r.siteId] = r.fetchedAt;

      const taken = seenPage.get(r.siteId) ?? new Set<string>();
      if (taken.has(r.pageUrl)) continue;
      taken.add(r.pageUrl);
      seenPage.set(r.siteId, taken);
      const results = r.results
        ? (JSON.parse(r.results) as { checks: CheckResult[] })
        : null;
      auditsBySiteId[r.siteId].push({ pageUrl: r.pageUrl, status: r.status, results });
    }
    auditedThisWeek = auditedSitesThisWeek.size;

    const geoRows = await db
      .select()
      .from(siteGeoAudits)
      .where(inArray(siteGeoAudits.siteId, siteIds))
      .orderBy(desc(siteGeoAudits.fetchedAt));
    const seenGeo = new Set<number>();
    for (const g of geoRows) {
      if (seenGeo.has(g.siteId)) continue;
      seenGeo.add(g.siteId);
      if (g.status === 'succeeded' && g.results) {
        geoBySiteId[g.siteId] = JSON.parse(g.results) as SiteGeoAuditResult;
      }
    }
  }

  return buildDashboardData({
    sites: userSites,
    auditsBySiteId,
    geoBySiteId,
    lastAuditedBySiteId,
    auditedThisWeek,
    trendPoints,
  });
}
```

- [ ] **Step 4: Run to verify pass** — Run: `pnpm test src/lib/services/dashboard.loader.test.ts`
  Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/dashboard.ts src/lib/services/dashboard.loader.test.ts
git commit -m "feat: loadDashboardData batched loader"
```

---

## Task 5: App sidebar component

**Files:**
- Create: `src/components/layout/app-sidebar.tsx`
- Test: `src/components/layout/app-sidebar.test.tsx`

- [ ] **Step 1: Write the failing test** — `app-sidebar.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppSidebar } from './app-sidebar';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
vi.mock('@/components/auth/user-menu', () => ({ UserMenu: () => <div>user-menu</div> }));

describe('AppSidebar', () => {
  it('renders real nav links and marks the active route', () => {
    render(<AppSidebar userEmail="tim@x.com" />);
    const dash = screen.getByRole('link', { name: 'Dashboard' });
    expect(dash).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Websites' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  });

  it('renders disabled "soon" items that are not links', () => {
    render(<AppSidebar userEmail="tim@x.com" />);
    expect(screen.queryByRole('link', { name: /Audit History/ })).toBeNull();
    expect(screen.getByText('Audit History')).toBeInTheDocument();
    expect(screen.getByText('tim@x.com')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `pnpm test src/components/layout/app-sidebar.test.tsx`
  Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `app-sidebar.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, Globe, History, Bell, Settings, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserMenu } from '@/components/auth/user-menu';

type NavItem = { label: string; href: string; icon: React.ComponentType<{ className?: string }> };

const PRIMARY: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutGrid },
  { label: 'Websites', href: '/dashboard', icon: Globe },
];
const SOON: { label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { label: 'Audit History', icon: History },
  { label: 'Alerts', icon: Bell },
];
const ACCOUNT: NavItem[] = [
  { label: 'Settings', href: '/settings/api-tokens', icon: Settings },
  { label: 'Docs', href: '/docs', icon: BookOpen },
];

export function AppSidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full w-full flex-col gap-6 bg-canvas-soft p-4">
      <Link href="/dashboard" className="flex items-center gap-2.5 px-2 py-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-v4.png" alt="" aria-hidden className="h-7 w-7 rounded-md" />
        <span className="text-sm font-semibold tracking-tight text-ink">AI Readiness</span>
      </Link>

      <nav className="flex flex-col gap-1">
        {PRIMARY.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                active ? 'bg-surface-strong font-medium text-ink' : 'text-body hover:bg-surface-card',
              )}
            >
              <Icon className="h-4 w-4 opacity-70" />
              {item.label}
            </Link>
          );
        })}
        {SOON.map(({ label, icon: Icon }) => (
          <div
            key={label}
            aria-disabled
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-soft"
          >
            <Icon className="h-4 w-4 opacity-50" />
            {label}
            <span className="ml-auto rounded-full border border-hairline bg-surface-card px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-muted">
              soon
            </span>
          </div>
        ))}
      </nav>

      <nav className="flex flex-col gap-1">
        <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-soft">Account</p>
        {ACCOUNT.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                active ? 'bg-surface-strong font-medium text-ink' : 'text-body hover:bg-surface-card',
              )}
            >
              <Icon className="h-4 w-4 opacity-70" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex items-center gap-2.5 rounded-lg border border-hairline bg-surface-card px-2.5 py-2">
        <UserMenu />
        <span className="truncate text-xs text-ink">{userEmail}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass** — Run: `pnpm test src/components/layout/app-sidebar.test.tsx`
  Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/app-sidebar.tsx src/components/layout/app-sidebar.test.tsx
git commit -m "feat: app sidebar with active state and soon items"
```

---

## Task 6: App shell + layout wiring

**Files:**
- Create: `src/components/layout/app-shell.tsx`
- Test: `src/components/layout/app-shell.test.tsx`
- Modify: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Write the failing test** — `app-shell.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppShell } from './app-shell';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
vi.mock('@/components/auth/user-menu', () => ({ UserMenu: () => <div>user-menu</div> }));

describe('AppShell', () => {
  it('renders children and the sidebar', () => {
    render(<AppShell userEmail="tim@x.com"><p>hello content</p></AppShell>);
    expect(screen.getByText('hello content')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Dashboard' }).length).toBeGreaterThan(0);
  });

  it('toggles the mobile drawer', () => {
    render(<AppShell userEmail="tim@x.com"><p>c</p></AppShell>);
    const toggle = screen.getByRole('button', { name: /menu/i });
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `pnpm test src/components/layout/app-shell.test.tsx`
  Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `app-shell.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppSidebar } from './app-sidebar';

export function AppShell({ userEmail, children }: { userEmail: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      {/* Desktop sidebar */}
      <aside className="hidden w-[228px] shrink-0 border-r border-hairline md:block">
        <div className="sticky top-0 h-screen">
          <AppSidebar userEmail={userEmail} />
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[228px] border-r border-hairline">
            <AppSidebar userEmail={userEmail} />
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="absolute right-2 top-2 rounded-md p-1 text-body hover:bg-surface-card"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center gap-3 border-b border-hairline px-4 md:hidden">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
            className="rounded-md p-1.5 text-body hover:bg-surface-card"
          >
            <Menu className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-v4.png" alt="" aria-hidden className="h-6 w-6 rounded" />
        </div>
        <main className={cn('mx-auto w-full max-w-[1100px] flex-1 px-6 py-10')}>{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass** — Run: `pnpm test src/components/layout/app-shell.test.tsx`
  Expected: PASS.

- [ ] **Step 5: Wire the layout** — replace `src/app/(app)/layout.tsx` with:

```tsx
import { requireUser } from '@/lib/auth-guards';
import { AppShell } from '@/components/layout/app-shell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <AppShell userEmail={user.email}>{children}</AppShell>;
}
```

- [ ] **Step 6: Verify build + run** — Run: `pnpm test src/components/layout/app-shell.test.tsx && pnpm build`
  Expected: tests PASS; build succeeds. Then `pnpm dev` and confirm an `(app)` route renders inside the sidebar. (Use the preview workflow.)

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/app-shell.tsx src/components/layout/app-shell.test.tsx "src/app/(app)/layout.tsx"
git commit -m "feat: app shell wraps (app) routes with sidebar"
```

---

## Task 7: StatCard component

**Files:**
- Create: `src/components/dashboard/stat-card.tsx`
- Test: `src/components/dashboard/stat-card.test.tsx`

- [ ] **Step 1: Write the failing test**:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatCard } from './stat-card';

describe('StatCard', () => {
  it('renders label, value and meta', () => {
    render(<StatCard label="Sites Monitored" value="8" meta="4 audited this week" />);
    expect(screen.getByText('Sites Monitored')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('4 audited this week')).toBeInTheDocument();
  });

  it('renders children (e.g. a sparkline slot)', () => {
    render(<StatCard label="Avg" value="83"><div data-testid="spark" /></StatCard>);
    expect(screen.getByTestId('spark')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `pnpm test src/components/dashboard/stat-card.test.tsx`
  Expected: FAIL.

- [ ] **Step 3: Implement** — `stat-card.tsx`:

```tsx
export function StatCard({
  label,
  value,
  meta,
  children,
}: {
  label: string;
  value: string;
  meta?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="relative rounded-xl border border-hairline bg-surface-card p-5">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-2 text-[34px] font-normal leading-none tracking-tight text-ink">{value}</p>
      {meta && <p className="mt-2 text-[12.5px] text-muted">{meta}</p>}
      {children && <div className="absolute bottom-4 right-4">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass** — Run: `pnpm test src/components/dashboard/stat-card.test.tsx`
  Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/stat-card.tsx src/components/dashboard/stat-card.test.tsx
git commit -m "feat: StatCard component"
```

---

## Task 8: ReadinessSparkline (inline SVG)

**Files:**
- Create: `src/components/dashboard/readiness-sparkline.tsx`
- Test: `src/components/dashboard/readiness-sparkline.test.tsx`

- [ ] **Step 1: Write the failing test**:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReadinessSparkline } from './readiness-sparkline';

describe('ReadinessSparkline', () => {
  it('shows a placeholder when there is not enough history', () => {
    render(<ReadinessSparkline data={null} />);
    expect(screen.getByText(/not enough history/i)).toBeInTheDocument();
  });

  it('renders a polyline for a data series', () => {
    const { container } = render(<ReadinessSparkline data={[70, 90]} />);
    const poly = container.querySelector('polyline');
    expect(poly).not.toBeNull();
    expect(poly!.getAttribute('points')).toContain(' ');
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `pnpm test src/components/dashboard/readiness-sparkline.test.tsx`
  Expected: FAIL.

- [ ] **Step 3: Implement** — `readiness-sparkline.tsx`:

```tsx
const W = 96;
const H = 32;

export function ReadinessSparkline({ data }: { data: number[] | null }) {
  if (!data || data.length < 2) {
    return <span className="text-[11px] text-muted-soft">Not enough history yet</span>;
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = W / (data.length - 1);
  const points = data
    .map((v, i) => `${(i * step).toFixed(1)},${(H - ((v - min) / span) * H).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke="var(--color-semantic-success)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
```

- [ ] **Step 4: Run to verify pass** — Run: `pnpm test src/components/dashboard/readiness-sparkline.test.tsx`
  Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/readiness-sparkline.tsx src/components/dashboard/readiness-sparkline.test.tsx
git commit -m "feat: inline-SVG ReadinessSparkline with history fallback"
```

---

## Task 9: AuditUrlStrip

**Files:**
- Create: `src/components/dashboard/audit-url-strip.tsx`
- Test: `src/components/dashboard/audit-url-strip.test.tsx`

- [ ] **Step 1: Write the failing test**:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AuditUrlStrip } from './audit-url-strip';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

describe('AuditUrlStrip', () => {
  it('routes to the add-site flow with the url prefilled', () => {
    render(<AuditUrlStrip />);
    fireEvent.change(screen.getByPlaceholderText(/yoursite/i), { target: { value: 'acme.com' } });
    fireEvent.click(screen.getByRole('button', { name: /audit/i }));
    expect(push).toHaveBeenCalledWith('/sites/new?url=acme.com');
  });

  it('does nothing when the field is empty', () => {
    push.mockClear();
    render(<AuditUrlStrip />);
    fireEvent.click(screen.getByRole('button', { name: /audit/i }));
    expect(push).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `pnpm test src/components/dashboard/audit-url-strip.test.tsx`
  Expected: FAIL.

- [ ] **Step 3: Implement** — `audit-url-strip.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';

export function AuditUrlStrip() {
  const router = useRouter();
  const [url, setUrl] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    router.push(`/sites/new?url=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-hairline bg-canvas-soft p-4">
      <p className="mb-2.5 flex items-center gap-2 text-[13px] text-body">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden /> Audit a new URL for AI readiness
      </p>
      <div className="flex h-11 items-center gap-2 rounded-lg border border-hairline-strong bg-surface-card pl-3.5 pr-1.5">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://yoursite.com"
          aria-label="Website URL to audit"
          className="h-full flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted-soft"
        />
        <button
          type="submit"
          className="rounded-md bg-ink px-3.5 py-1.5 text-[13px] font-medium text-canvas transition-colors hover:opacity-90"
        >
          Audit
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Run to verify pass** — Run: `pnpm test src/components/dashboard/audit-url-strip.test.tsx`
  Expected: PASS (note: `encodeURIComponent('acme.com')` === `'acme.com'`).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/audit-url-strip.tsx src/components/dashboard/audit-url-strip.test.tsx
git commit -m "feat: AuditUrlStrip routes to prefilled add-site flow"
```

---

## Task 10: SitesTableRow

**Files:**
- Create: `src/components/dashboard/sites-table-row.tsx`
- Test: `src/components/dashboard/sites-table-row.test.tsx`

Helpers in this file: `bandColor(score)` → token var for ring/bar; `PillarCell` →
bar + value or `—`. Renders inside a `<tr>`. Tests wrap rows in `<table><tbody>`.

- [ ] **Step 1: Write the failing test**:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SitesTableRow } from './sites-table-row';
import type { DashboardSiteRow } from '@/lib/services/dashboard';
import type { Site } from '@/db/schema';

function row(over: Partial<DashboardSiteRow>): DashboardSiteRow {
  const site = { id: 1, uid: 'uid-1', name: 'acme.com', rootUrl: 'https://acme.com', displayName: null, faviconUrl: null } as Site;
  return {
    site,
    scores: { readable: { score: 80, tier: 'good' }, recommendable: null, recognized: { score: 60, tier: 'fair' } },
    composite: 70,
    issues: 3,
    nextAction: { checkId: 'h1-present', pillar: 'readable', pageUrl: 'https://acme.com/', weight: 5, recommendation: 'Add an H1' },
    lastAuditedAt: '2026-06-01T00:00:00Z',
    audited: true,
    ...over,
  };
}
function wrap(r: DashboardSiteRow) {
  return render(<table><tbody><SitesTableRow row={r} /></tbody></table>);
}

describe('SitesTableRow', () => {
  it('shows composite, pillar values and a dash for unscored pillars', () => {
    wrap(row({}));
    expect(screen.getByText('70')).toBeInTheDocument(); // composite ring
    expect(screen.getByText('80')).toBeInTheDocument(); // readable
    expect(screen.getByText('—')).toBeInTheDocument();  // recommendable not run
    expect(screen.getByText(/3 issues/)).toBeInTheDocument();
  });

  it('shows a Run audit action for a never-audited site', () => {
    wrap(row({ audited: false, composite: null, issues: 0, nextAction: null,
      scores: { readable: null, recommendable: null, recognized: null }, lastAuditedAt: null }));
    expect(screen.getByRole('link', { name: /run audit/i })).toHaveAttribute('href', '/sites/uid-1');
  });

  it('shows caught up when there are no issues but it was audited', () => {
    wrap(row({ issues: 0, nextAction: null }));
    expect(screen.getByText(/caught up/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `pnpm test src/components/dashboard/sites-table-row.test.tsx`
  Expected: FAIL.

- [ ] **Step 3: Implement** — `sites-table-row.tsx`:

```tsx
import Link from 'next/link';
import type { DashboardSiteRow } from '@/lib/services/dashboard';
import type { PillarScore } from '@/lib/citation-audit/site-readiness';
import { formatRelativeTime } from '@/lib/format-time';

function bandColor(score: number): string {
  if (score >= 70) return 'var(--color-semantic-success)';
  if (score >= 50) return '#3a6ea5';
  if (score >= 30) return '#d9a200';
  return 'var(--color-destructive)';
}

function PillarCell({ score }: { score: PillarScore | null }) {
  if (!score) {
    return (
      <td className="px-3 py-3.5">
        <span className="text-sm text-muted-soft">—</span>
      </td>
    );
  }
  return (
    <td className="px-3 py-3.5">
      <div className="flex min-w-[120px] items-center gap-2.5">
        <div className="h-[5px] flex-1 overflow-hidden rounded-sm bg-hairline">
          <div className="h-full rounded-sm" style={{ width: `${score.score}%`, background: bandColor(score.score) }} />
        </div>
        <span className="w-6 text-right text-[13px] tabular-nums text-body">{score.score}</span>
      </div>
    </td>
  );
}

export function SitesTableRow({ row }: { row: DashboardSiteRow }) {
  const { site, scores, composite, issues, nextAction, lastAuditedAt, audited } = row;
  const host = site.rootUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return (
    <tr className="border-b border-hairline">
      <td className="px-3 py-3.5">
        <Link href={`/sites/${site.uid}`} className="flex items-center gap-3 hover:opacity-80">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-strong text-[13px] font-bold text-ink">
            {host.charAt(0).toUpperCase()}
          </span>
          <span className="flex flex-col">
            <span className="text-sm font-medium text-ink">{site.displayName ?? site.name}</span>
            <span className="font-mono text-[11.5px] text-muted">
              {host}{lastAuditedAt ? ` · ${formatRelativeTime(lastAuditedAt)}` : ''}
            </span>
          </span>
        </Link>
      </td>
      <td className="px-3 py-3.5">
        {composite !== null ? (
          <span
            className="flex h-[42px] w-[42px] items-center justify-center rounded-full border-[3px] text-[13px] font-semibold text-ink"
            style={{ borderColor: bandColor(composite) }}
          >
            {composite}
          </span>
        ) : (
          <span className="text-sm text-muted-soft">—</span>
        )}
      </td>
      <PillarCell score={scores.readable} />
      <PillarCell score={scores.recommendable} />
      <PillarCell score={scores.recognized} />
      <td className="px-3 py-3.5 text-right">
        {!audited ? (
          <Link
            href={`/sites/${site.uid}`}
            className="inline-flex items-center rounded-full border border-hairline-strong bg-surface-card px-3 py-1.5 text-xs font-medium text-ink hover:bg-canvas-soft"
          >
            Run audit
          </Link>
        ) : issues > 0 ? (
          <span className="inline-flex flex-col items-end gap-0.5">
            <span className="rounded-full bg-[#fdeede] px-2.5 py-1 text-xs font-medium text-[#b86a14]">
              {issues} issue{issues === 1 ? '' : 's'}
            </span>
            {nextAction?.recommendation && (
              <span className="max-w-[180px] truncate text-[11px] text-muted">{nextAction.recommendation}</span>
            )}
          </span>
        ) : (
          <span className="rounded-full bg-[#e6f3ee] px-2.5 py-1 text-xs font-medium text-semantic-success">
            ✓ caught up
          </span>
        )}
      </td>
    </tr>
  );
}
```

- [ ] **Step 4: Run to verify pass** — Run: `pnpm test src/components/dashboard/sites-table-row.test.tsx`
  Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/sites-table-row.tsx src/components/dashboard/sites-table-row.test.tsx
git commit -m "feat: SitesTableRow with pillar cells and empty/issue states"
```

---

## Task 11: SitesTable

**Files:**
- Create: `src/components/dashboard/sites-table.tsx`
- Test: `src/components/dashboard/sites-table.test.tsx`

- [ ] **Step 1: Write the failing test**:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SitesTable } from './sites-table';
import type { DashboardSiteRow } from '@/lib/services/dashboard';
import type { Site } from '@/db/schema';

function r(id: number, name: string): DashboardSiteRow {
  return {
    site: { id, uid: `uid-${id}`, name, rootUrl: `https://${name}`, displayName: null, faviconUrl: null } as Site,
    scores: { readable: null, recommendable: null, recognized: null },
    composite: null, issues: 0, nextAction: null, lastAuditedAt: null, audited: false,
  };
}

describe('SitesTable', () => {
  it('renders a header and one row per site', () => {
    render(<SitesTable rows={[r(1, 'a.com'), r(2, 'b.com')]} />);
    expect(screen.getByText('Readable')).toBeInTheDocument();
    expect(screen.getByText('Recommendable')).toBeInTheDocument();
    expect(screen.getByText('Recognized')).toBeInTheDocument();
    expect(screen.getByText('a.com')).toBeInTheDocument();
    expect(screen.getByText('b.com')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure** — Run: `pnpm test src/components/dashboard/sites-table.test.tsx`
  Expected: FAIL.

- [ ] **Step 3: Implement** — `sites-table.tsx`:

```tsx
import type { DashboardSiteRow } from '@/lib/services/dashboard';
import { SitesTableRow } from './sites-table-row';

const TH = 'px-3 pb-3 text-left text-[10.5px] font-semibold uppercase tracking-wider text-muted';

export function SitesTable({ rows }: { rows: DashboardSiteRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-hairline">
            <th className={TH}>Website</th>
            <th className={TH}>Score</th>
            <th className={TH}>Readable</th>
            <th className={TH}>Recommendable</th>
            <th className={TH}>Recognized</th>
            <th className={`${TH} text-right`}>Issues</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <SitesTableRow key={row.site.id} row={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass** — Run: `pnpm test src/components/dashboard/sites-table.test.tsx`
  Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/sites-table.tsx src/components/dashboard/sites-table.test.tsx
git commit -m "feat: SitesTable header + rows"
```

---

## Task 12: Dashboard page assembly

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`

Empty state reuses `AddSiteCard`. The "Avg. Readiness" meta shows the delta when present.

- [ ] **Step 1: Replace `page.tsx`** with:

```tsx
import { requireUser } from '@/lib/auth-guards';
import { loadDashboardData } from '@/lib/services/dashboard';
import { StatCard } from '@/components/dashboard/stat-card';
import { ReadinessSparkline } from '@/components/dashboard/readiness-sparkline';
import { AuditUrlStrip } from '@/components/dashboard/audit-url-strip';
import { SitesTable } from '@/components/dashboard/sites-table';
import { AddSiteCard } from '@/components/sites/add-site-card';

export default async function DashboardPage() {
  const user = await requireUser();
  const data = await loadDashboardData(user.id);

  if (data.stats.sitesMonitored === 0) {
    return (
      <div className="flex flex-col gap-8">
        <header>
          <h1 className="display-lg text-ink">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">AEO · AIO · GEO readiness across your sites</p>
        </header>
        <div className="grid grid-cols-1 gap-6 sm:max-w-sm">
          <AddSiteCard />
        </div>
      </div>
    );
  }

  const delta = data.stats.avgReadinessDelta;
  return (
    <div className="flex flex-col gap-7">
      <header>
        <h1 className="display-lg text-ink">Dashboard</h1>
        <p className="mt-1 text-sm text-muted">AEO · AIO · GEO readiness across your sites</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Sites Monitored"
          value={String(data.stats.sitesMonitored)}
          meta={`${data.stats.auditedThisWeek} audited this week`}
        />
        <StatCard
          label="Avg. Readiness"
          value={data.stats.avgReadiness !== null ? String(data.stats.avgReadiness) : '—'}
          meta={
            delta !== null ? (
              <span>
                <span className={delta >= 0 ? 'font-semibold text-semantic-success' : 'font-semibold text-destructive'}>
                  {delta >= 0 ? `+${delta}` : delta}
                </span>{' '}
                recent trend
              </span>
            ) : (
              'No trend yet'
            )
          }
        >
          <ReadinessSparkline data={data.trend} />
        </StatCard>
        <StatCard label="Open Issues" value={String(data.stats.openIssues)} meta="across all sites" />
      </div>

      <AuditUrlStrip />

      <section>
        <h2 className="mb-3 text-xl font-normal tracking-tight text-ink">Monitored Websites</h2>
        <SitesTable rows={data.rows} />
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verify build + manual run** — Run: `pnpm build`
  Expected: build succeeds. Then `pnpm dev` and confirm `/dashboard` shows stat cards, the URL strip, and the table (use the preview workflow). Confirm the empty state by viewing as a user with no sites if available.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/dashboard/page.tsx"
git commit -m "feat: assemble redesigned dashboard page"
```

---

## Task 13: Prefill the add-site flow from `?url=`

**Files:**
- Modify: `src/components/sites/site-form.tsx`
- Modify: `src/app/(app)/sites/new/page.tsx`
- Test: `src/components/sites/site-form.test.tsx`

- [ ] **Step 1: Add a failing test** to `site-form.test.tsx`:

```tsx
it('prefills the URL input from initialUrl', () => {
  render(<SiteForm onSubmit={() => {}} initialUrl="https://acme.com" />);
  expect(screen.getByLabelText('Website URL')).toHaveValue('https://acme.com');
});
```

- [ ] **Step 2: Run to verify failure** — Run: `pnpm test src/components/sites/site-form.test.tsx`
  Expected: FAIL — `initialUrl` not supported.

- [ ] **Step 3: Implement** — in `site-form.tsx`, extend the props and initial state:

```tsx
export function SiteForm({
  onSubmit,
  onPreflightSuccess,
  initialUrl = '',
}: {
  onSubmit: (v: SiteFormValues) => void;
  onPreflightSuccess?: (result: PreflightResult) => void;
  initialUrl?: string;
}) {
  const [rootUrl, setRootUrl] = useState(initialUrl);
  // ...rest unchanged
```

- [ ] **Step 4: Wire the page** — update `src/app/(app)/sites/new/page.tsx` to read the
query param via `useSearchParams` (wrapped in `Suspense`, required by App Router for
client components). Restructure the default export:

```tsx
'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { SiteForm, type SiteFormValues } from '@/components/sites/site-form';
import { Confetti } from '@/components/ui/confetti';

export default function NewSitePage() {
  return (
    <Suspense fallback={null}>
      <NewSiteInner />
    </Suspense>
  );
}

function NewSiteInner() {
  const router = useRouter();
  const initialUrl = useSearchParams().get('url') ?? '';
  const [showConfetti, setShowConfetti] = useState(false);
  // ...existing mutation body unchanged...
```

In the existing JSX, pass the prop: `<SiteForm initialUrl={initialUrl} onSubmit={(v) => mutation.mutate(v)} onPreflightSuccess={() => setShowConfetti(true)} />`.

- [ ] **Step 5: Run to verify pass + build** — Run: `pnpm test src/components/sites/site-form.test.tsx && pnpm build`
  Expected: PASS; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/sites/site-form.tsx "src/app/(app)/sites/new/page.tsx" src/components/sites/site-form.test.tsx
git commit -m "feat: prefill add-site form from ?url= query param"
```

---

## Task 14: Remove legacy SitesList / SiteCard + final verification

**Files:**
- Delete: `src/components/sites/sites-list.tsx`, `src/components/sites/sites-list.test.tsx`
- Delete: `src/components/sites/site-card.tsx`, `src/components/sites/site-card.test.tsx`

- [ ] **Step 1: Confirm no remaining importers**

Run: `grep -rn "sites-list\|site-card\|SitesList\|SiteCard" src --include=*.tsx --include=*.ts | grep -v node_modules`
Expected: no matches outside the files being deleted. (If any appear, fix them before deleting.)

- [ ] **Step 2: Delete the files**

```bash
git rm src/components/sites/sites-list.tsx src/components/sites/sites-list.test.tsx \
       src/components/sites/site-card.tsx src/components/sites/site-card.test.tsx
```

- [ ] **Step 3: Full verification** — Run: `pnpm test && pnpm build && pnpm lint`
  Expected: all tests PASS, build succeeds, lint clean.

- [ ] **Step 4: Manual smoke** — `pnpm dev`, then via the preview workflow confirm:
  sidebar shell on `/dashboard`; stat cards + sparkline (or "Not enough history yet"); URL strip routes to `/sites/new?url=…` with the field prefilled; table rows show full / partial (`—`) / never-audited (Run audit) states; mobile drawer toggles below `md`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: remove legacy SitesList/SiteCard superseded by dashboard table"
```

---

## Self-Review Notes (author)

- **Spec coverage:** shell (T5–6), stat cards (T7), sparkline + fallback (T8), URL strip (T9, T13), table with composite/pillars/issues/empty states (T10–11), composite = mean of scored pillars (T1–2), issues = count + next action (T1, T10), batched no-N+1 loader (T4), removal of legacy grid (T14). All §-sections mapped.
- **Type consistency:** `DashboardSiteRow`, `DashboardStats`, `DashboardData`, `DashboardInput` defined once in Task 2 and reused verbatim in Tasks 4/10/11/12. `compositeScore`/`failingCheckCount`/`PillarScore`/`NextAction`/`SitePillarScores`/`AuditLike` come from `site-readiness.ts`.
- **Known proxy:** the headline "Avg. Readiness" is the current cross-site composite; the sparkline shows the historical movement of average page audit scores (directional proxy) — labeled "recent trend", with the explicit "Not enough history yet" fallback so it is never misleading.
```
