import { describe, it, expect } from 'vitest';
import { scoreGeoSignals } from './score';
import type { GeoSignalResult } from './types';

const sig = (signal: GeoSignalResult['signal'], weight: number, present: boolean): GeoSignalResult => ({
  signal, weight, present, artifacts: [], pages: [], recommendation: present ? null : 'do it',
});

describe('scoreGeoSignals', () => {
  it('sums weights of present signals', () => {
    const r = scoreGeoSignals([
      sig('pricing', 40, true),
      sig('comparison', 30, false),
      sig('case-study', 30, true),
    ]);
    expect(r.score).toBe(70);
    expect(r.tier).toBe('good');
  });

  it('scores zero when nothing is present', () => {
    const r = scoreGeoSignals([
      sig('pricing', 40, false),
      sig('comparison', 30, false),
      sig('case-study', 30, false),
    ]);
    expect(r.score).toBe(0);
    expect(r.tier).toBe('poor');
  });

  it('scores 100 when all present', () => {
    const r = scoreGeoSignals([
      sig('pricing', 40, true),
      sig('comparison', 30, true),
      sig('case-study', 30, true),
    ]);
    expect(r.score).toBe(100);
    expect(r.tier).toBe('excellent');
  });
});
