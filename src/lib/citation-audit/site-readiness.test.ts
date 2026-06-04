import { describe, it, expect } from 'vitest';
import { sitePillarScores, pickNextAction, stageStatus, compositeScore, failingCheckCount, type AuditLike } from './site-readiness';
import type { CheckResult } from './types';
import type { SiteGeoAuditResult } from '@/lib/geo-audit/types';

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
  it('prompts for a GEO run when both built pillars clear 70 but no GEO result yet', () => {
    expect(stageStatus({ readable: { score: 80, tier: 'good' }, recognized: { score: 75, tier: 'good' }, recommendable: null }))
      .toMatch(/GEO/);
  });
});

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

  it('excludes recommendable per-page checks (GEO is the authority for that pillar)', () => {
    const audits = [audit('https://x.com/', [chk('lists-tables', 0, 5), chk('h1-present', 0, 5)])];
    // only h1-present (readable) counts; lists-tables (recommendable) is excluded
    expect(failingCheckCount(audits, null)).toBe(1);
  });
});
