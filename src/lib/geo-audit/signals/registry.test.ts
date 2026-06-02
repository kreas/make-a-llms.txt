import { describe, it, expect } from 'vitest';
import { SIGNAL_REGISTRY, getSignal } from './index';

describe('signal registry', () => {
  it('registers the universal core signals', () => {
    expect(getSignal('social-proof')?.id).toBe('social-proof');
    expect(getSignal('differentiation')?.id).toBe('differentiation');
  });

  it('every registered signal has the required shape', () => {
    for (const [id, def] of Object.entries(SIGNAL_REGISTRY)) {
      expect(def.id).toBe(id);
      expect(def.label.length).toBeGreaterThan(0);
      expect(def.tags.length).toBeGreaterThan(0);
      expect(def.defaultWeight).toBeGreaterThan(0);
      expect(Array.isArray(def.urlPatterns)).toBe(true);
      expect(typeof def.gate).toBe('function');
      expect(typeof def.confirmPrompt).toBe('function');
      expect(def.recommendation.length).toBeGreaterThan(0);
    }
  });

  it('social-proof gate fires on testimonial/review language', () => {
    const sig = getSignal('social-proof')!;
    expect(sig.gate({ url: 'https://x.test/', path: 'index', markdown: 'See our 5-star reviews and testimonials.' })).not.toBeNull();
    expect(sig.gate({ url: 'https://x.test/', path: 'index', markdown: 'A quiet page.' })).toBeNull();
  });
});
