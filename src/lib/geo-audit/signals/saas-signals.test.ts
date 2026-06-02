import { describe, it, expect } from 'vitest';
import { getSignal } from './index';
import type { GeoPageInput } from '../types';

const page = (over: Partial<GeoPageInput>): GeoPageInput => ({ url: 'https://acme.test/', path: 'index', markdown: '', ...over });

describe('SaaS signals', () => {
  it('pricing gates by URL and by price+plan keywords', () => {
    const s = getSignal('pricing')!;
    expect(s.gate(page({ url: 'https://acme.test/pricing' }))).not.toBeNull();
    expect(s.gate(page({ markdown: 'Plans start at $29/mo.' }))).not.toBeNull();
    expect(s.gate(page({ markdown: 'We donated $5.' }))).toBeNull();
    expect(s.urlPatterns).toContain('**/pricing**');
  });

  it('comparison gates by URL and "X vs Y"', () => {
    const s = getSignal('comparison')!;
    expect(s.gate(page({ url: 'https://acme.test/compare/acme-vs-beta' }))).not.toBeNull();
    expect(s.gate(page({ markdown: '## Acme vs Beta' }))).not.toBeNull();
  });

  it('case-study gates by URL and metric+testimonial', () => {
    const s = getSignal('case-study')!;
    expect(s.gate(page({ url: 'https://acme.test/customers/x' }))).not.toBeNull();
    expect(s.gate(page({ markdown: 'Northwind achieved 40% faster onboarding.' }))).not.toBeNull();
  });
});
