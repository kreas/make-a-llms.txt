import { describe, it, expect } from 'vitest';
import { effectiveWeight, scoreActiveSignals } from './score';
import type { GeoSignalResult } from './types';
import { getSignal } from './signals/index';

describe('effectiveWeight', () => {
  it('applies the goal multiplier when a tag matches', () => {
    const caseStudy = getSignal('case-study')!; // tags: evidence, proof
    expect(effectiveWeight(caseStudy, 'get-cited')).toBe(45); // 30 * 1.5 (evidence)
    expect(effectiveWeight(caseStudy, 'win-comparisons')).toBe(30); // no tag overlap
  });
});

const result = (signal: string, weight: number, present: boolean): GeoSignalResult => ({
  signal, label: signal, tags: [], weight, present, artifacts: [], pages: [], recommendation: present ? null : 'x',
});

describe('scoreActiveSignals', () => {
  it('normalizes present effective weight to 0-100', () => {
    const r = scoreActiveSignals([
      result('pricing', 40, true),
      result('comparison', 30, false),
      result('case-study', 30, true),
    ]);
    expect(r.score).toBe(70);
    expect(r.tier).toBe('good');
  });

  it('stays 0-100 regardless of raw weight magnitudes', () => {
    const r = scoreActiveSignals([
      result('a', 25, true),
      result('b', 15, true),
      result('c', 30, false),
    ]); // present 40 of 70 => 57
    expect(r.score).toBe(57);
  });

  it('scores 0 when the active set is empty', () => {
    expect(scoreActiveSignals([]).score).toBe(0);
  });
});
