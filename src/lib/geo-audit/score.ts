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
