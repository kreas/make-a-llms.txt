import { describe, it, expect, vi } from 'vitest';
import { analyzeGeoPages } from './analyze';
import type { GeoConfirmFn, GeoPageInput } from './types';

const pages: GeoPageInput[] = [
  { url: 'https://acme.test/pricing', path: 'pricing', markdown: 'Plans from $29/mo.' },
  { url: 'https://acme.test/customers/x', path: 'customers/x', markdown: 'Achieved 40% faster onboarding.' },
  { url: 'https://acme.test/about', path: 'about', markdown: 'Why choose us: the only tool that…' },
];

describe('analyzeGeoPages', () => {
  it('resolves the active set for the site type, confirms, and scores', async () => {
    const confirm: GeoConfirmFn = vi.fn(async (signalId) => {
      if (signalId === 'pricing') return { confirmed: true, artifact: 'from $29/mo' };
      if (signalId === 'case-study') return { confirmed: true, artifact: '40% faster onboarding' };
      if (signalId === 'differentiation') return { confirmed: true, artifact: 'the only tool that…' };
      return { confirmed: false, artifact: null };
    });

    const result = await analyzeGeoPages(pages, { entityName: 'Acme', siteType: 'saas', goal: 'win-comparisons' }, confirm);

    const ids = result.signals.map((s) => s.signal);
    expect(ids).toEqual(['social-proof', 'differentiation', 'topical-depth', 'verifiable-proofs', 'expertise-signals', 'ratings-reviews', 'pricing', 'comparison', 'case-study']);
    expect(result.signals.find((s) => s.signal === 'pricing')!.present).toBe(true);
    expect(result.signals.find((s) => s.signal === 'comparison')!.present).toBe(false);
    expect(result.siteType).toBe('saas');
    expect(result.goal).toBe('win-comparisons');
    expect(result.score).toBeGreaterThan(0);
  });

  it('only confirms gated candidates (no gate → not present, not called)', async () => {
    const confirm = vi.fn<GeoConfirmFn>(async () => ({ confirmed: true, artifact: 'x' }));
    const result = await analyzeGeoPages(
      [{ url: 'https://acme.test/', path: 'index', markdown: 'nothing relevant here' }],
      { entityName: 'Acme', siteType: 'other', goal: 'get-cited' },
      confirm,
    );
    expect(result.signals.every((s) => !s.present)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});
