import { describe, it, expect } from 'vitest';
import { activeSignalIds, PROFILES, GOAL_BOOSTS, UNIVERSAL_CORE } from './profiles';
import { getSignal } from './signals/index';

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

  it('local/services/ecommerce active sets include their bonus signals', () => {
    expect(activeSignalIds('local')).toEqual([...UNIVERSAL_CORE, 'location-hours', 'menu-services']);
    expect(activeSignalIds('services')).toEqual([...UNIVERSAL_CORE, 'case-study', 'client-proof', 'service-offerings']);
    expect(activeSignalIds('ecommerce')).toEqual([...UNIVERSAL_CORE, 'pricing', 'product-detail', 'shipping-returns']);
  });

  it('every profile bonus signal is a registered signal', () => {
    for (const t of ['saas', 'ecommerce', 'local', 'publisher', 'services', 'other'] as const) {
      for (const id of PROFILES[t].bonusSignals) {
        expect(getSignal(id), `missing signal: ${id}`).toBeDefined();
      }
    }
  });

  it('every goal boosts at least one tag', () => {
    for (const g of ['get-cited', 'win-comparisons', 'build-trust'] as const) {
      expect(GOAL_BOOSTS[g].tags.length).toBeGreaterThan(0);
      expect(GOAL_BOOSTS[g].multiplier).toBeGreaterThan(1);
    }
  });
});
