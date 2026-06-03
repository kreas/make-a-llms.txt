import { describe, it, expect } from 'vitest';
import { gatePage } from './gates';
import type { GeoPageInput } from './types';

const page = (over: Partial<GeoPageInput>): GeoPageInput => ({
  url: 'https://acme.test/',
  path: 'index',
  markdown: '',
  ...over,
});

describe('gatePage', () => {
  it('gates a pricing page by URL', () => {
    const m = gatePage(page({ url: 'https://acme.test/pricing' }));
    expect(m.map((x) => x.signal)).toContain('pricing');
  });

  it('gates a pricing page by body (price + plan keyword)', () => {
    const m = gatePage(page({ markdown: 'Plans start at $29/mo for the Pro tier.' }));
    expect(m.map((x) => x.signal)).toContain('pricing');
  });

  it('does not gate pricing on an incidental dollar mention', () => {
    const m = gatePage(page({ markdown: 'We donated $5 to charity last year.' }));
    expect(m.map((x) => x.signal)).not.toContain('pricing');
  });

  it('gates a comparison page by URL', () => {
    const m = gatePage(page({ url: 'https://acme.test/compare/acme-vs-beta' }));
    expect(m.map((x) => x.signal)).toContain('comparison');
  });

  it('gates a comparison page by "X vs Y" heading', () => {
    const m = gatePage(page({ markdown: '## Acme vs Beta\nA detailed look.' }));
    expect(m.map((x) => x.signal)).toContain('comparison');
  });

  it('gates a case study by URL', () => {
    const m = gatePage(page({ url: 'https://acme.test/customers/northwind' }));
    expect(m.map((x) => x.signal)).toContain('case-study');
  });

  it('gates a case study by metric + testimonial language', () => {
    const m = gatePage(page({ markdown: 'Northwind achieved 40% faster onboarding with our platform.' }));
    expect(m.map((x) => x.signal)).toContain('case-study');
  });

  it('intentionally over-gates borderline "X vs Y" prose (LLM confirm filters later)', () => {
    // The gate is deliberately permissive; the LLM confirm step is the precision layer.
    const m = gatePage(page({ markdown: 'When weighing manual vs automated workflows, teams differ.' }));
    expect(m.map((x) => x.signal)).toContain('comparison');
  });

  it('returns no matches for an ordinary page', () => {
    expect(gatePage(page({ markdown: 'About our founding story.' }))).toEqual([]);
  });
});
