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
    return 'Your pages aren\'t fully readable to AI yet. Start here — clean structure and clear answers come first.';
  }
  if (recognized < CLEARED) {
    return 'Your site is Readable. Next: help AI recognize who you are.';
  }
  return 'Readable and Recognized — Recommendable is coming soon. You\'re ahead of the curve.';
}
