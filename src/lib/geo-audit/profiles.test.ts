import { describe, it, expect } from 'vitest';
import { activeSignalIds, PROFILES, GOAL_BOOSTS, UNIVERSAL_CORE } from './profiles';

describe('profiles', () => {
  it('saas active set = core + saas bonus', () => {
    expect(activeSignalIds('saas')).toEqual([...UNIVERSAL_CORE, 'pricing', 'comparison', 'case-study']);
  });

  it('publisher active set = core + publisher bonus', () => {
    expect(activeSignalIds('publisher')).toEqual([...UNIVERSAL_CORE, 'author-credibility', 'cited-sources', 'original-data']);
  });

  it('other is core-only', () => {
    expect(activeSignalIds('other')).toEqual([...UNIVERSAL_CORE]);
  });

  it('has a profile entry for every site type', () => {
    for (const t of ['saas', 'ecommerce', 'local', 'publisher', 'services', 'other'] as const) {
      expect(PROFILES[t]).toBeDefined();
    }
  });

  it('every goal boosts at least one tag', () => {
    for (const g of ['get-cited', 'win-comparisons', 'build-trust'] as const) {
      expect(GOAL_BOOSTS[g].tags.length).toBeGreaterThan(0);
      expect(GOAL_BOOSTS[g].multiplier).toBeGreaterThan(1);
    }
  });
});
