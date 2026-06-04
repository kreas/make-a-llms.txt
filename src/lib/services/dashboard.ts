import { desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { sites as sitesTable, citationAudits, siteGeoAudits } from '@/db/schema';
import type { Site } from '@/db/schema';
import type { SiteGeoAuditResult } from '@/lib/geo-audit/types';
import type { CheckResult } from '@/lib/citation-audit/types';
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
  /** True iff the site has >=1 succeeded audit with results (drives the "Run audit" CTA). */
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
  // Delta tracks the visible sparkline window: newest minus oldest point in `trend` (≤7 days).
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
