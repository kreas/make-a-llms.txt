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

  it('confirms candidates concurrently (bounded) without dropping any', async () => {
    // Each page gates several core signals (ratings, proofs, expertise, social-proof),
    // so there are well over 8 confirm tasks — enough to exercise the worker pool.
    const md =
      'Rated 4.8/5 from 320 reviews. ISO 9001 certified, award-winning. Our board-certified team has 15 years of experience.';
    const many: GeoPageInput[] = Array.from({ length: 5 }, (_, i) => ({
      url: `https://x.test/p${i}`,
      path: `p${i}`,
      markdown: md,
    }));

    let inFlight = 0;
    let maxInFlight = 0;
    const confirm: GeoConfirmFn = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return { confirmed: true, artifact: 'x' };
    });

    const result = await analyzeGeoPages(many, { entityName: 'X', siteType: 'other', goal: 'build-trust' }, confirm);

    expect(result.metadata.confirmCalls).toBeGreaterThan(8); // more tasks than the concurrency cap
    expect(maxInFlight).toBeGreaterThan(1); // genuinely ran in parallel
    expect(maxInFlight).toBeLessThanOrEqual(8); // …but bounded
    for (const id of ['ratings-reviews', 'verifiable-proofs', 'expertise-signals']) {
      expect(result.signals.find((s) => s.signal === id)!.present).toBe(true);
    }
  });

  it('tolerates an individual confirm failure without aborting the audit', async () => {
    const confirm: GeoConfirmFn = vi.fn(async (signalId) => {
      if (signalId === 'pricing') throw new Error('gateway timeout');
      if (signalId === 'case-study') return { confirmed: true, artifact: '40% faster' };
      return { confirmed: false, artifact: null };
    });
    const result = await analyzeGeoPages(pages, { entityName: 'Acme', siteType: 'saas', goal: 'get-cited' }, confirm);
    // The failed call leaves its candidate unconfirmed; everything else still resolves.
    expect(result.signals.find((s) => s.signal === 'pricing')!.present).toBe(false);
    expect(result.signals.find((s) => s.signal === 'case-study')!.present).toBe(true);
  });

  it('fails the audit when every confirm call fails (gateway down)', async () => {
    const confirm: GeoConfirmFn = vi.fn(async () => {
      throw new Error('gateway down');
    });
    await expect(
      analyzeGeoPages(pages, { entityName: 'Acme', siteType: 'saas', goal: 'get-cited' }, confirm),
    ).rejects.toThrow(/all candidate checks failed/i);
  });
});
