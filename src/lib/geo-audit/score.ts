import { tierFor } from '@/lib/citation-audit/rubric';
import type { Tier } from '@/lib/citation-audit/types';
import type { GeoSignalResult } from './types';

export function scoreGeoSignals(signals: GeoSignalResult[]): { score: number; tier: Tier } {
  const score = signals.reduce((sum, s) => sum + (s.present ? s.weight : 0), 0);
  return { score, tier: tierFor(score) };
}
