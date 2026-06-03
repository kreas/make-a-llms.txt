import { describe, it, expect } from 'vitest';
import { getSignal } from './index';
import type { GeoPageInput } from '../types';

const page = (over: Partial<GeoPageInput>): GeoPageInput => ({ url: 'https://x.test/', path: 'index', markdown: '', ...over });

describe('local/services/ecommerce signals', () => {
  it('all six new signals are registered with the required shape', () => {
    for (const id of ['location-hours', 'menu-services', 'client-proof', 'service-offerings', 'product-detail', 'shipping-returns']) {
      const s = getSignal(id);
      expect(s?.id).toBe(id);
      expect(s!.tags.length).toBeGreaterThan(0);
      expect(s!.defaultWeight).toBeGreaterThan(0);
    }
  });

  it('location-hours gates on address / hours / phone', () => {
    const s = getSignal('location-hours')!;
    expect(s.gate(page({ markdown: 'Visit us at 123 Main Street. Open 11am - 10pm daily.' }))).not.toBeNull();
    expect(s.gate(page({ markdown: 'Call (512) 555-1234 to order.' }))).not.toBeNull();
    expect(s.gate(page({ markdown: 'A page about nothing.' }))).toBeNull();
  });

  it('menu-services gates on a menu', () => {
    expect(getSignal('menu-services')!.gate(page({ markdown: 'Our menu: classic burger, fries, shakes.' }))).not.toBeNull();
  });

  it('client-proof gates on named clients/portfolio', () => {
    expect(getSignal('client-proof')!.gate(page({ markdown: 'Trusted by Acme, Globex, and Initech. See our portfolio.' }))).not.toBeNull();
  });

  it('service-offerings gates on a capability list', () => {
    expect(getSignal('service-offerings')!.gate(page({ markdown: 'What we do: branding, web design, and motion.' }))).not.toBeNull();
  });

  it('product-detail gates on product specs', () => {
    expect(getSignal('product-detail')!.gate(page({ markdown: 'Add to cart. Materials: 100% cotton. Size guide below.' }))).not.toBeNull();
  });

  it('shipping-returns gates on policy language', () => {
    expect(getSignal('shipping-returns')!.gate(page({ markdown: 'Free shipping over $50. 30-day returns.' }))).not.toBeNull();
  });
});
