import type { CheckResult, Tier } from './types';
import { tierFor } from './rubric';
import { PILLAR_OF, scorePillar, type Pillar } from './pillars';
import type { SiteGeoAuditResult } from '@/lib/geo-audit/types';

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
