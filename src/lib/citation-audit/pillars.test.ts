import { describe, it, expect } from 'vitest';
import { PILLAR_OF, PILLARS, pillarOf, scorePillar } from './pillars';
import { RUBRIC } from './rubric';
import type { CheckResult } from './types';

function mk(id: string, score: number, weight: number): CheckResult {
  return { id, score, weight, passed: score >= 70, evidence: [], recommendation: null };
}

describe('pillars', () => {
  it('assigns every rubric check to exactly one pillar', () => {
    for (const entry of RUBRIC) {
      expect(PILLARS).toContain(PILLAR_OF[entry.id]);
    }
    expect(Object.keys(PILLAR_OF).length).toBe(RUBRIC.length);
  });

  it('pillar weight subtotals match the spec (65 / 5 / 40)', () => {
    const sum = (p: string) =>
      RUBRIC.filter((r) => PILLAR_OF[r.id] === p).reduce((a, r) => a + r.weight, 0);
    expect(sum('readable')).toBe(65);
    expect(sum('recommendable')).toBe(5);
    expect(sum('recognized')).toBe(40);
  });

  it('pillarOf returns undefined for unknown ids', () => {
    expect(pillarOf('nope')).toBeUndefined();
  });

  it("scorePillar weighted-aggregates only that pillar's checks", () => {
    // readable has answer-position(15)=100 and h1-present(5)=0 → 100*15/(15+5)=75
    const checks = [mk('answer-position', 100, 15), mk('h1-present', 0, 5), mk('schema-type', 0, 10)];
    const r = scorePillar(checks, 'readable');
    expect(r.score).toBe(75);
    expect(r.tier).toBe('good');
  });

  it('scorePillar returns null when the pillar has no checks present', () => {
    expect(scorePillar([mk('schema-type', 100, 10)], 'readable')).toBeNull();
  });
});
