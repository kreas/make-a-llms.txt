import { describe, it, expect } from 'vitest';
import { RUBRIC, RUBRIC_WEIGHTS_TOTAL, tierFor } from './rubric';

describe('rubric', () => {
  it('contains exactly 15 entries', () => {
    expect(RUBRIC.length).toBe(15);
  });

  it('all entries have unique ids', () => {
    const ids = RUBRIC.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('weights total 100', () => {
    const sum = RUBRIC.reduce((acc, r) => acc + r.weight, 0);
    expect(sum).toBe(100);
    expect(RUBRIC_WEIGHTS_TOTAL).toBe(100);
  });

  it('maps tiers correctly', () => {
    expect(tierFor(0)).toBe('poor');
    expect(tierFor(49)).toBe('poor');
    expect(tierFor(50)).toBe('fair');
    expect(tierFor(69)).toBe('fair');
    expect(tierFor(70)).toBe('good');
    expect(tierFor(84)).toBe('good');
    expect(tierFor(85)).toBe('excellent');
    expect(tierFor(100)).toBe('excellent');
  });
});
