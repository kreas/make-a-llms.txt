# Recommendable v2 — Experience Implementation Plan (Plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tailored two-step Recommendable experience on top of the Plan 1 engine — auto-discovery → confirm card (type + goal) → live progress → charts-forward results — plus a three-pillar radar on the Overview.

**Architecture:** A `useGeoAudit` hook wraps the engine API (latest with polling, classify, run). Small presentational components (score gauge, signal list, confirm card, pillar radar) compose into a rewritten `RecommendablePanel` state machine. Charts use the already-installed shadcn `chart` wrapper over Recharts, mirroring the existing `citations-score-card.tsx` radial pattern (score rendered as a DOM overlay so it stays testable).

**Tech Stack:** Next.js 16, React 19, TanStack Query, Recharts via `@/components/ui/chart`, Tailwind v4, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-02-recommendable-v2-tailored-geo-design.md` (§9)

**Prerequisite:** Plan 1 (engine) is merged/available — its API (`POST …/geo-audit/classify`, `POST …/geo-audit`, `GET …/geo-audit/latest`) and `SerializedSiteGeoAudit` type are consumed here.

---

## File Structure

**New:**
- `src/components/generations/use-geo-audit.ts` — data hook (latest+poll, classify, run).
- `src/components/generations/geo-score-gauge.tsx` — radial score gauge.
- `src/components/generations/geo-signal-list.tsx` — per-signal rows + weight bars.
- `src/components/generations/geo-confirm-card.tsx` — type + goal confirm card.
- `src/components/generations/pillar-radar.tsx` — three-pillar radar.

**Rewritten:**
- `src/components/generations/recommendable-panel.tsx` — the state machine (was the v1 panel).

**Modified:**
- `src/components/generations/overview-panel.tsx` — add the pillar radar.

Each component ships with a `.test.tsx` (project rule).

---

## Shared test helper

Every test in this plan uses a TanStack Query wrapper and stubbed `fetch`. Each test file defines locally:

```tsx
function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}
```

---

## Task 1: `useGeoAudit` data hook

**Files:**
- Create: `src/components/generations/use-geo-audit.ts`
- Test: `src/components/generations/use-geo-audit.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `src/components/generations/use-geo-audit.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGeoAudit } from './use-geo-audit';

const fetchMock = vi.fn();
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });

function hookWrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useGeoAudit', () => {
  it('loads the latest audit', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ audit: { status: 'succeeded', score: 70 } }) });
    const { result } = renderHook(() => useGeoAudit('site-1'), { wrapper: hookWrap() });
    await waitFor(() => expect(result.current.audit?.status).toBe('succeeded'));
  });

  it('classify() posts to the classify endpoint', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ audit: null }) })            // latest
      .mockResolvedValueOnce({ ok: true, json: async () => ({ suggestedType: 'publisher', confidence: 0.9 }) }); // classify
    const { result } = renderHook(() => useGeoAudit('site-1'), { wrapper: hookWrap() });
    const res = await result.current.classify();
    expect(res.suggestedType).toBe('publisher');
    expect(fetchMock).toHaveBeenCalledWith('/api/sites/site-1/geo-audit/classify', { method: 'POST' });
  });

  it('run() posts type + goal', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ audit: null }) })            // latest
      .mockResolvedValueOnce({ ok: true, json: async () => ({ audit: { status: 'pending' } }) }); // run
    const { result } = renderHook(() => useGeoAudit('site-1'), { wrapper: hookWrap() });
    await result.current.run({ siteType: 'saas', goal: 'get-cited' });
    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/sites/site-1/geo-audit');
    expect(call?.[1]?.method).toBe('POST');
    expect(JSON.parse(call?.[1]?.body)).toEqual({ siteType: 'saas', goal: 'get-cited' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.** Run: `pnpm test use-geo-audit.test` — Expected: FAIL.

- [ ] **Step 3: Write the hook.** Create `src/components/generations/use-geo-audit.ts`:

```ts
'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SerializedSiteGeoAudit } from '@/lib/geo-audit/serialize';

export type SiteType = 'saas' | 'ecommerce' | 'local' | 'publisher' | 'services' | 'other';
export type Goal = 'get-cited' | 'win-comparisons' | 'build-trust';

export type ClassifyResult = { suggestedType: SiteType; confidence: number };

export function useGeoAudit(siteId: string) {
  const queryClient = useQueryClient();
  const key = ['geo-audit', 'latest', siteId];

  const latest = useQuery({
    queryKey: key,
    queryFn: async (): Promise<{ audit: SerializedSiteGeoAudit | null }> => {
      const res = await fetch(`/api/sites/${siteId}/geo-audit/latest`);
      if (!res.ok) throw new Error('Failed to load GEO analysis');
      return res.json();
    },
    // Poll while a run is in flight.
    refetchInterval: (q) => {
      const s = (q.state.data as { audit: SerializedSiteGeoAudit | null } | undefined)?.audit?.status;
      return s === 'pending' || s === 'running' ? 3000 : false;
    },
  });

  const classifyMut = useMutation({
    mutationFn: async (): Promise<ClassifyResult> => {
      const res = await fetch(`/api/sites/${siteId}/geo-audit/classify`, { method: 'POST' });
      if (!res.ok) throw new Error('Classification failed');
      return res.json();
    },
  });

  const runMut = useMutation({
    mutationFn: async (input: { siteType: SiteType; goal: Goal }): Promise<SerializedSiteGeoAudit> => {
      const res = await fetch(`/api/sites/${siteId}/geo-audit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error('Analysis failed to start');
      const body = (await res.json()) as { audit: SerializedSiteGeoAudit };
      return body.audit;
    },
    onSuccess: (audit) => {
      queryClient.setQueryData(key, { audit }); // seed pending; polling takes over
    },
  });

  return {
    audit: latest.data?.audit ?? null,
    isLoading: latest.isPending,
    isError: latest.isError,
    classify: () => classifyMut.mutateAsync(),
    classifyState: classifyMut,
    run: (input: { siteType: SiteType; goal: Goal }) => runMut.mutateAsync(input),
    runState: runMut,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes.** Run: `pnpm test use-geo-audit.test` — Expected: PASS (3 tests).

- [ ] **Step 5: Commit.**

```bash
git add src/components/generations/use-geo-audit.ts src/components/generations/use-geo-audit.test.tsx
git commit -m "feat: useGeoAudit data hook (latest+poll, classify, run)"
```

---

## Task 2: Radial score gauge

**Files:**
- Create: `src/components/generations/geo-score-gauge.tsx`
- Test: `src/components/generations/geo-score-gauge.test.tsx`

Mirrors `src/components/citations/citations-score-card.tsx` (RadialBarChart + DOM overlay for the number).

- [ ] **Step 1: Write the failing test.** Create `src/components/generations/geo-score-gauge.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GeoScoreGauge } from './geo-score-gauge';

describe('GeoScoreGauge', () => {
  it('renders the score and tier as text', () => {
    render(<GeoScoreGauge score={70} tier="good" />);
    expect(screen.getByText('70')).toBeInTheDocument();
    expect(screen.getByText(/good/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.** Run: `pnpm test geo-score-gauge.test` — Expected: FAIL.

- [ ] **Step 3: Write the component.** Create `src/components/generations/geo-score-gauge.tsx`:

```tsx
'use client';
import { RadialBar, RadialBarChart, PolarAngleAxis } from 'recharts';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';

type Tier = 'excellent' | 'good' | 'fair' | 'poor';

const TIER_FILL: Record<Tier, string> = {
  poor: 'var(--color-destructive)',
  fair: 'var(--color-body)',
  good: 'var(--color-semantic-success)',
  excellent: 'var(--color-semantic-success)',
};

export function GeoScoreGauge({ score, tier }: { score: number; tier: Tier }) {
  const config = { score: { label: 'Score', color: TIER_FILL[tier] } } satisfies ChartConfig;
  const data = [{ name: 'score', value: score, fill: TIER_FILL[tier] }];
  return (
    <div className="relative aspect-square w-32 shrink-0">
      <ChartContainer config={config} className="h-full w-full">
        <RadialBarChart data={data} innerRadius="76%" outerRadius="100%" startAngle={90} endAngle={-270}>
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="value" background={{ fill: 'var(--color-surface-card)' }} cornerRadius={999} />
        </RadialBarChart>
      </ChartContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="display-md leading-none text-ink">{score}</span>
        <span className="text-xs capitalize text-body">{tier}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes.** Run: `pnpm test geo-score-gauge.test` — Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/components/generations/geo-score-gauge.tsx src/components/generations/geo-score-gauge.test.tsx
git commit -m "feat: GEO radial score gauge"
```

---

## Task 3: Signal list with weight bars

**Files:**
- Create: `src/components/generations/geo-signal-list.tsx`
- Test: `src/components/generations/geo-signal-list.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `src/components/generations/geo-signal-list.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GeoSignalList } from './geo-signal-list';
import type { SerializedSiteGeoAudit } from '@/lib/geo-audit/serialize';

const signals: NonNullable<SerializedSiteGeoAudit['results']>['signals'] = [
  { signal: 'pricing', label: 'Public pricing page', tags: ['value'], weight: 40, present: true, artifacts: ['from $29/mo'], pages: ['https://acme.test/pricing'], recommendation: null },
  { signal: 'comparison', label: 'Competitor comparison', tags: ['comparison'], weight: 30, present: false, artifacts: [], pages: [], recommendation: 'Add a comparison page.' },
];

describe('GeoSignalList', () => {
  it('renders present signals with artifacts and missing ones with recommendations', () => {
    render(<GeoSignalList signals={signals} />);
    expect(screen.getByText('Public pricing page')).toBeInTheDocument();
    expect(screen.getByText('from $29/mo')).toBeInTheDocument();
    expect(screen.getByText('Add a comparison page.')).toBeInTheDocument();
    expect(screen.getAllByRole('progressbar').length).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.** Run: `pnpm test geo-signal-list.test` — Expected: FAIL.

- [ ] **Step 3: Write the component.** Create `src/components/generations/geo-signal-list.tsx`:

```tsx
'use client';
import { Check, X } from 'lucide-react';
import type { SerializedSiteGeoAudit } from '@/lib/geo-audit/serialize';

type Signal = NonNullable<SerializedSiteGeoAudit['results']>['signals'][number];

function pathOf(url: string): string {
  try { return new URL(url).pathname; } catch { return url; }
}

export function GeoSignalList({ signals }: { signals: Signal[] }) {
  return (
    <ul className="divide-y divide-hairline">
      {signals.map((s) => (
        <li key={s.signal} className="flex gap-3 py-4">
          <span className={`mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${s.present ? 'bg-semantic-success/10 text-semantic-success' : 'bg-canvas-soft text-muted-soft'}`}>
            {s.present ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-medium text-ink">{s.label}</p>
              <span className="font-mono text-xs text-muted-soft tabular-nums">{s.weight} pts</span>
            </div>
            <div
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-canvas-soft"
              role="progressbar"
              aria-valuenow={s.present ? s.weight : 0}
              aria-valuemin={0}
              aria-valuemax={s.weight}
              aria-label={s.label}
            >
              <div className="h-full rounded-full bg-semantic-success" style={{ width: s.present ? '100%' : '0%' }} />
            </div>
            {s.present && s.artifacts.length > 0 && (
              <p className="mt-1.5 text-sm text-body">{s.artifacts.join(' · ')}</p>
            )}
            {s.present && s.pages.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                {s.pages.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer" className="text-xs text-muted-strong underline decoration-hairline-strong underline-offset-2 hover:text-ink">
                    {pathOf(url)}
                  </a>
                ))}
              </div>
            )}
            {!s.present && s.recommendation && (
              <p className="mt-1.5 border-l-2 border-hairline-strong pl-3 text-sm text-body">{s.recommendation}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes.** Run: `pnpm test geo-signal-list.test` — Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/components/generations/geo-signal-list.tsx src/components/generations/geo-signal-list.test.tsx
git commit -m "feat: GEO signal list with weight bars"
```

---

## Task 4: Confirm card (type + goal)

**Files:**
- Create: `src/components/generations/geo-confirm-card.tsx`
- Test: `src/components/generations/geo-confirm-card.test.tsx`

- [ ] **Step 1: Write the failing test.** Create `src/components/generations/geo-confirm-card.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GeoConfirmCard } from './geo-confirm-card';

describe('GeoConfirmCard', () => {
  it('shows the suggested type and submits the chosen type + goal', async () => {
    const onAnalyze = vi.fn();
    render(<GeoConfirmCard suggestedType="publisher" confidence={0.86} onAnalyze={onAnalyze} isRunning={false} />);
    expect(screen.getByText(/blog \/ publisher/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /build trust/i }));
    await userEvent.click(screen.getByRole('button', { name: /^analyze/i }));
    expect(onAnalyze).toHaveBeenCalledWith({ siteType: 'publisher', goal: 'build-trust' });
  });

  it('lets the user change the type', async () => {
    const onAnalyze = vi.fn();
    render(<GeoConfirmCard suggestedType="saas" confidence={0.9} onAnalyze={onAnalyze} isRunning={false} />);
    await userEvent.selectOptions(screen.getByLabelText(/site type/i), 'ecommerce');
    await userEvent.click(screen.getByRole('button', { name: /^analyze/i }));
    expect(onAnalyze).toHaveBeenCalledWith(expect.objectContaining({ siteType: 'ecommerce' }));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.** Run: `pnpm test geo-confirm-card.test` — Expected: FAIL.

- [ ] **Step 3: Write the component.** Create `src/components/generations/geo-confirm-card.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { SiteType, Goal } from './use-geo-audit';

const TYPE_LABELS: Record<SiteType, string> = {
  saas: 'B2B SaaS / software',
  publisher: 'Blog / publisher',
  ecommerce: 'Ecommerce / store',
  local: 'Local business',
  services: 'Agency / services',
  other: 'Other',
};

const GOALS: { id: Goal; label: string }[] = [
  { id: 'get-cited', label: 'Get cited by AI' },
  { id: 'build-trust', label: 'Build trust & authority' },
  { id: 'win-comparisons', label: 'Win comparisons' },
];

export function GeoConfirmCard({
  suggestedType,
  confidence,
  onAnalyze,
  isRunning,
}: {
  suggestedType: SiteType;
  confidence: number;
  onAnalyze: (input: { siteType: SiteType; goal: Goal }) => void;
  isRunning: boolean;
}) {
  const lowConfidence = confidence < 0.5;
  const [siteType, setSiteType] = useState<SiteType>(lowConfidence ? 'other' : suggestedType);
  const [goal, setGoal] = useState<Goal>('get-cited');

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 py-8">
      <div className="text-center">
        <Sparkles className="mx-auto mb-2 h-7 w-7 text-muted-soft" aria-hidden="true" />
        <p className="text-lg text-ink">{lowConfidence ? 'Tell us what kind of site this is' : "Here's what we detected"}</p>
      </div>

      <label className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-canvas-soft px-4 py-3 text-sm">
        <span className="text-body">Site type</span>
        <span className="flex items-center gap-2">
          <span className="sr-only" id="site-type-label">Site type</span>
          <select
            aria-label="Site type"
            value={siteType}
            onChange={(e) => setSiteType(e.target.value as SiteType)}
            className="rounded-md border border-hairline-strong bg-surface-card px-2 py-1 text-sm text-ink"
          >
            {(Object.keys(TYPE_LABELS) as SiteType[]).map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
        </span>
      </label>
      {!lowConfidence && (
        <p className="-mt-3 text-center font-mono text-xs text-muted-soft">confidence {confidence.toFixed(2)}</p>
      )}

      <div>
        <p className="mb-2 text-sm font-medium text-ink">What&apos;s your main goal?</p>
        <div className="flex flex-col gap-2">
          {GOALS.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGoal(g.id)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${goal === g.id ? 'border-primary bg-primary/5 text-ink' : 'border-hairline text-body hover:bg-canvas-soft'}`}
            >
              <span className={`h-3 w-3 rounded-full border ${goal === g.id ? 'border-primary bg-primary' : 'border-hairline-strong'}`} />
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onAnalyze({ siteType, goal })}
        disabled={isRunning}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {isRunning ? 'Starting…' : 'Analyze →'}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes.** Run: `pnpm test geo-confirm-card.test` — Expected: PASS (2 tests).

- [ ] **Step 5: Commit.**

```bash
git add src/components/generations/geo-confirm-card.tsx src/components/generations/geo-confirm-card.test.tsx
git commit -m "feat: GEO confirm card (type + goal)"
```

---

## Task 5: Rewrite RecommendablePanel as the state machine

**Files:**
- Modify: `src/components/generations/recommendable-panel.tsx` (replace v1 contents)
- Modify: `src/components/generations/recommendable-panel.test.tsx` (replace v1 contents)

States: **loading** → (no audit) **discovering** (auto-classify) → **confirm** → (run) **running** (poll) → **results** | **failed**. Return visits with a succeeded audit land on **results**; a "Re-run / change type" control re-opens the confirm card.

- [ ] **Step 1: Write the failing test.** Replace `src/components/generations/recommendable-panel.test.tsx` with:

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
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });

const RESULT = {
  status: 'succeeded', score: 70, tier: 'good', fetchedAt: new Date().toISOString(),
  siteType: 'publisher', goal: 'build-trust',
  results: {
    siteType: 'publisher', goal: 'build-trust', score: 70, tier: 'good',
    metadata: { pagesScanned: 18, candidates: 4, confirmCalls: 4 },
    signals: [
      { signal: 'author-credibility', label: 'Author credibility', tags: ['trust'], weight: 25, present: true, artifacts: ['bylines + bios'], pages: ['https://b.test/p'], recommendation: null },
    ],
  },
};

describe('RecommendablePanel', () => {
  it('auto-discovers then shows the confirm card when no audit exists', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ audit: null }) })                         // latest
      .mockResolvedValueOnce({ ok: true, json: async () => ({ suggestedType: 'publisher', confidence: 0.86 }) }); // classify
    wrap(<RecommendablePanel siteId="s1" />);
    expect(await screen.findByText(/blog \/ publisher/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^analyze/i })).toBeInTheDocument();
  });

  it('renders results when a succeeded audit exists', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ audit: RESULT }) });
    wrap(<RecommendablePanel siteId="s1" />);
    expect(await screen.findByText('70')).toBeInTheDocument();
    expect(screen.getByText('Author credibility')).toBeInTheDocument();
    expect(screen.getByText('bylines + bios')).toBeInTheDocument();
  });

  it('shows a running state for an in-flight audit', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ audit: { status: 'running', stage: 'confirming' } }) });
    wrap(<RecommendablePanel siteId="s1" />);
    expect(await screen.findByText(/analyzing/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.** Run: `pnpm test recommendable-panel.test` — Expected: FAIL.

- [ ] **Step 3: Write the component.** Replace `src/components/generations/recommendable-panel.tsx` with:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { TabPanel } from '@/components/layout/tab-panel';
import { formatRelativeTime } from '@/lib/format-time';
import { useGeoAudit, type SiteType, type Goal } from './use-geo-audit';
import { GeoConfirmCard } from './geo-confirm-card';
import { GeoScoreGauge } from './geo-score-gauge';
import { GeoSignalList } from './geo-signal-list';

const STAGE_LABEL: Record<string, string> = {
  crawling: 'Crawling your site',
  confirming: 'Confirming candidates with a model',
  scoring: 'Scoring signals',
};

export function RecommendablePanel({ siteId }: { siteId: string }) {
  const { audit, isLoading, classify, classifyState, run, runState } = useGeoAudit(siteId);
  const [editing, setEditing] = useState(false);
  const [suggested, setSuggested] = useState<{ siteType: SiteType; confidence: number } | null>(null);

  const status = audit?.status ?? null;
  const needsDiscovery = !isLoading && audit === null && suggested === null && !classifyState.isPending;

  // Auto-run discovery once when there's no audit yet.
  useEffect(() => {
    if (!needsDiscovery) return;
    let cancelled = false;
    classify()
      .then((r) => { if (!cancelled) setSuggested({ siteType: r.suggestedType, confidence: r.confidence }); })
      .catch(() => { if (!cancelled) setSuggested({ siteType: 'other', confidence: 0 }); });
    return () => { cancelled = true; };
  }, [needsDiscovery, classify]);

  async function handleAnalyze(input: { siteType: SiteType; goal: Goal }) {
    setEditing(false);
    await run(input);
  }

  if (isLoading) {
    return <TabPanel flat><p className="py-8 text-center text-body">Loading…</p></TabPanel>;
  }

  // Running / pending
  if (status === 'pending' || status === 'running') {
    return (
      <TabPanel flat>
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-soft" aria-hidden="true" />
          <p className="text-ink">Analyzing — you can leave and come back</p>
          <p className="text-sm text-muted-soft">{STAGE_LABEL[audit?.stage ?? ''] ?? 'Starting…'}</p>
        </div>
      </TabPanel>
    );
  }

  const result = status === 'succeeded' ? audit?.results ?? null : null;

  // Confirm card: no successful result yet, or the user chose to edit.
  if (!result || editing) {
    if (classifyState.isPending || (!suggested && !audit)) {
      return (
        <TabPanel flat>
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Sparkles className="h-6 w-6 animate-pulse text-muted-soft" aria-hidden="true" />
            <p className="text-sm text-body">Reading your crawled pages…</p>
          </div>
        </TabPanel>
      );
    }
    const seedType = (audit?.siteType as SiteType) ?? suggested?.siteType ?? 'other';
    const seedConf = suggested?.confidence ?? 1;
    return (
      <TabPanel flat>
        <GeoConfirmCard
          suggestedType={seedType}
          confidence={seedConf}
          onAnalyze={handleAnalyze}
          isRunning={runState.isPending}
        />
        {runState.isError && <p className="pb-4 text-center text-sm text-destructive">Couldn&apos;t start the analysis. Try again.</p>}
      </TabPanel>
    );
  }

  // Results
  return (
    <TabPanel
      flat
      meta={<GeoScoreGauge score={result.score} tier={result.tier} />}
      actions={
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-canvas px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-canvas-soft"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Re-run / change type
        </button>
      }
    >
      <p className="mb-3 text-xs text-muted-soft">
        {audit?.fetchedAt ? `Last analyzed ${formatRelativeTime(audit.fetchedAt)} · ` : ''}
        {result.siteType} · goal: {result.goal}
      </p>
      <GeoSignalList signals={result.signals} />
      <p className="mt-4 text-xs text-muted-soft">
        Scanned {result.metadata.pagesScanned} pages, checked {result.metadata.confirmCalls} candidates with a model.
      </p>
    </TabPanel>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes.** Run: `pnpm test recommendable-panel.test` — Expected: PASS (3 tests).

- [ ] **Step 5: Commit.**

```bash
git add src/components/generations/recommendable-panel.tsx src/components/generations/recommendable-panel.test.tsx
git commit -m "feat: rewrite RecommendablePanel as tailored two-step state machine"
```

---

## Task 6: Three-pillar radar on the Overview

**Files:**
- Create: `src/components/generations/pillar-radar.tsx`
- Test: `src/components/generations/pillar-radar.test.tsx`
- Modify: `src/components/generations/overview-panel.tsx`
- Modify: `src/components/generations/overview-panel.test.tsx`

- [ ] **Step 1: Write the failing radar test.** Create `src/components/generations/pillar-radar.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PillarRadar } from './pillar-radar';

describe('PillarRadar', () => {
  it('renders the three pillar scores as accessible text', () => {
    render(<PillarRadar readable={88} recommendable={55} recognized={74} />);
    expect(screen.getByText(/readable 88/i)).toBeInTheDocument();
    expect(screen.getByText(/recommendable 55/i)).toBeInTheDocument();
    expect(screen.getByText(/recognized 74/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.** Run: `pnpm test pillar-radar.test` — Expected: FAIL.

- [ ] **Step 3: Write the radar.** Create `src/components/generations/pillar-radar.tsx`:

```tsx
'use client';
import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from 'recharts';
import { ChartContainer, type ChartConfig } from '@/components/ui/chart';

export function PillarRadar({
  readable,
  recommendable,
  recognized,
}: {
  readable: number;
  recommendable: number;
  recognized: number;
}) {
  const data = [
    { pillar: 'Readable', value: readable },
    { pillar: 'Recommendable', value: recommendable },
    { pillar: 'Recognized', value: recognized },
  ];
  const config = { value: { label: 'Score', color: 'var(--color-primary)' } } satisfies ChartConfig;

  return (
    <div>
      <ChartContainer config={config} className="mx-auto aspect-square w-full max-w-[220px]">
        <RadarChart data={data}>
          <PolarGrid />
          <PolarAngleAxis dataKey="pillar" />
          <Radar dataKey="value" fill="var(--color-primary)" fillOpacity={0.2} stroke="var(--color-primary)" />
        </RadarChart>
      </ChartContainer>
      {/* Accessible / testable text mirror of the chart */}
      <ul className="sr-only">
        {data.map((d) => (
          <li key={d.pillar}>{d.pillar} {d.value}</li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes.** Run: `pnpm test pillar-radar.test` — Expected: PASS.

- [ ] **Step 5: Add the radar to the Overview.** In `src/components/generations/overview-panel.tsx`, add the import:

```ts
import { PillarRadar } from './pillar-radar';
```

Then, directly above the three pillar cards grid (the `<div className="grid grid-cols-1 gap-4 md:grid-cols-3">`), insert the radar, rendered only when all three pillar scores exist:

```tsx
      {scores.readable && scores.recognized && scores.recommendable && (
        <div className="mb-6 rounded-xl border border-hairline bg-surface-card p-5">
          <p className="caption-uppercase text-muted-strong mb-3">Your AI-readiness shape</p>
          <PillarRadar
            readable={scores.readable.score}
            recommendable={scores.recommendable.score}
            recognized={scores.recognized.score}
          />
        </div>
      )}
```

- [ ] **Step 6: Add an Overview test for the radar.** Append to `src/components/generations/overview-panel.test.tsx` a case where all three pillars have scores (citation-audits return cleared Readable+Recognized; geo-audit returns a succeeded result), then assert `screen.getByText(/your ai-readiness shape/i)` is present. Use the existing fetch-mock-by-url pattern already in that file; return a geo-audit `results` with `score` set and non-empty pillar data so `scores.recommendable` is non-null.

```tsx
it('shows the AI-readiness radar when all three pillars have scores', async () => {
  fetchMock.mockImplementation((url: string) => {
    if (url.includes('citation-audits/latest')) {
      return Promise.resolve({ ok: true, json: async () => ({ audits: [
        { pageUrl: 'https://acme.test/', status: 'succeeded', results: { checks: [
          { id: 'answer-position', passed: true, score: 100, weight: 15, evidence: [], recommendation: null },
          { id: 'schema-type', passed: true, score: 100, weight: 10, evidence: [], recommendation: null },
        ] } },
      ] }) });
    }
    if (url.includes('geo-audit/latest')) {
      return Promise.resolve({ ok: true, json: async () => ({ audit: { status: 'succeeded', score: 70, tier: 'good', results: { score: 70, tier: 'good', siteType: 'saas', goal: 'get-cited', signals: [], metadata: { pagesScanned: 1, candidates: 0, confirmCalls: 0 } } } }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
  wrap(<OverviewPanel siteId="site-1" onNavigate={() => {}} />);
  expect(await screen.findByText(/your ai-readiness shape/i)).toBeInTheDocument();
});
```

- [ ] **Step 7: Run the tests + full verification.** Run:
- `pnpm test pillar-radar.test overview-panel.test recommendable-panel.test` — Expected: PASS.
- `pnpm test` — all suites green.
- `pnpm tsc --noEmit` — no new errors in the changed files.
- `pnpm build` — succeeds.

- [ ] **Step 8: Commit.**

```bash
git add src/components/generations/pillar-radar.tsx src/components/generations/pillar-radar.test.tsx src/components/generations/overview-panel.tsx src/components/generations/overview-panel.test.tsx
git commit -m "feat: three-pillar AI-readiness radar on the Overview"
```

---

## Experience verification (after all tasks)

- [ ] `pnpm test` — all suites green.
- [ ] `pnpm tsc --noEmit` — no new errors in `src/components/generations/**`.
- [ ] `pnpm build` — succeeds.
- [ ] Manual (dev server on :4242): open a never-analyzed site → Recommendable tab auto-discovers → confirm card shows detected type + goal → Analyze → running state with stage → results with the radial gauge, signal weight bars, and extracted artifacts. Overview shows the three-pillar radar once all pillars have scores. Re-run / change type re-opens the confirm card.
