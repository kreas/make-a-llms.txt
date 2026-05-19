import type { CheckResult, Tier } from './types';
import { tierFor } from './rubric';

export function aggregate(checks: CheckResult[]): { score: number; tier: Tier } {
  const totalWeight = checks.reduce((a, c) => a + c.weight, 0);
  if (totalWeight === 0) return { score: 0, tier: 'poor' };
  const weightedSum = checks.reduce((a, c) => a + c.score * c.weight, 0);
  const score = Math.round(weightedSum / totalWeight);
  return { score, tier: tierFor(score) };
}
