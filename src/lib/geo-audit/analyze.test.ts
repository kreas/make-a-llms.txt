import { describe, it, expect, vi } from 'vitest';
import { analyzeGeoPages } from './analyze';
import type { GeoConfirmFn, GeoPageInput } from './types';

const pages: GeoPageInput[] = [
  { url: 'https://acme.test/pricing', path: 'pricing', markdown: 'Plans from $29/mo.' },
  { url: 'https://acme.test/customers/x', path: 'customers/x', markdown: 'Achieved 40% faster onboarding.' },
  { url: 'https://acme.test/about', path: 'about', markdown: 'Our story.' },
];

describe('analyzeGeoPages', () => {
  it('confirms gated candidates and scores present signals', async () => {
    const confirm: GeoConfirmFn = vi.fn(async (signal) => {
      if (signal === 'pricing') return { confirmed: true, artifact: 'from $29/mo' };
      if (signal === 'case-study') return { confirmed: true, artifact: '40% faster onboarding' };
      return { confirmed: false, artifact: null };
    });

    const result = await analyzeGeoPages(pages, 'Acme', confirm);

    const pricing = result.signals.find((s) => s.signal === 'pricing')!;
    const comparison = result.signals.find((s) => s.signal === 'comparison')!;
    const caseStudy = result.signals.find((s) => s.signal === 'case-study')!;

    expect(pricing.present).toBe(true);
    expect(pricing.artifacts).toContain('from $29/mo');
    expect(caseStudy.present).toBe(true);
    expect(comparison.present).toBe(false);
    expect(comparison.recommendation).not.toBeNull();
    expect(result.score).toBe(70); // pricing 40 + case-study 30
    expect(result.metadata.confirmCalls).toBe(2); // only 2 candidates gated
  });

  it('marks a signal absent when the LLM rejects every candidate', async () => {
    const confirm: GeoConfirmFn = vi.fn(async () => ({ confirmed: false, artifact: null }));
    const result = await analyzeGeoPages(pages, 'Acme', confirm);
    expect(result.signals.every((s) => !s.present)).toBe(true);
    expect(result.score).toBe(0);
  });

  it('caps candidates per signal at 5', async () => {
    const many: GeoPageInput[] = Array.from({ length: 8 }, (_, i) => ({
      url: `https://acme.test/customers/${i}`,
      path: `customers/${i}`,
      markdown: 'x',
    }));
    const confirm = vi.fn<GeoConfirmFn>(async () => ({ confirmed: false, artifact: null }));
    const result = await analyzeGeoPages(many, 'Acme', confirm);
    const caseStudyCalls = confirm.mock.calls.filter((c) => c[0] === 'case-study').length;
    expect(caseStudyCalls).toBe(5);
    expect(result.metadata.candidates).toBe(5);
  });
});
