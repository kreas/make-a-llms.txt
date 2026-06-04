import { describe, it, expect } from 'vitest';
import { buildDashboardData, buildReadinessTrend, type DashboardInput } from './dashboard';
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
function ok(pageUrl: string, results: AuditLike['results']): AuditLike {
  return { pageUrl, status: 'succeeded', results };
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
    // weighted: (80*15 + 0*5) / (15+5) = 60
    expect(a.scores.readable?.score).toBe(60);
    expect(a.composite).toBe(60); // only readable scored
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
    expect(data.stats.avgReadiness).toBe(60); // only site 1 has a composite
    expect(data.stats.openIssues).toBe(1);
  });
});

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
