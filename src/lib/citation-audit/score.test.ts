import { describe, it, expect } from 'vitest';
import { aggregate } from './score';
import type { CheckResult } from './types';

function mkCheck(id: string, score: number, weight: number): CheckResult {
  return { id, score, weight, passed: score >= 70, evidence: [], recommendation: null };
}

describe('aggregate', () => {
  it('returns weighted average rounded to int', () => {
    const result = aggregate([mkCheck('a', 100, 50), mkCheck('b', 0, 50)]);
    expect(result.score).toBe(50);
    expect(result.tier).toBe('fair');
  });

  it('all-100 yields 100 / excellent', () => {
    const result = aggregate([mkCheck('a', 100, 25), mkCheck('b', 100, 75)]);
    expect(result.score).toBe(100);
    expect(result.tier).toBe('excellent');
  });

  it('all-0 yields 0 / poor', () => {
    const result = aggregate([mkCheck('a', 0, 50), mkCheck('b', 0, 50)]);
    expect(result.score).toBe(0);
    expect(result.tier).toBe('poor');
  });

  it('rounds to nearest integer', () => {
    const result = aggregate([mkCheck('a', 75, 1), mkCheck('b', 76, 1)]);
    expect(result.score).toBe(76);
  });
});
