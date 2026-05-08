import { describe, it, expect } from 'vitest';
import {
  createSiteSchema,
  updateSiteSchema,
  createGenerationSchema,
  webhookBodySchema,
  normalizeRootUrl,
} from './validators';

describe('validators', () => {
  it('normalizeRootUrl returns lowercase origin without path', () => {
    expect(normalizeRootUrl('https://Example.COM/path?q=1')).toBe('https://example.com');
    expect(normalizeRootUrl('https://example.com/')).toBe('https://example.com');
  });

  it('createSiteSchema accepts valid input and normalizes rootUrl', () => {
    const out = createSiteSchema.parse({
      name: 'Acme',
      rootUrl: 'https://Acme.com/path',
      sitemapUrl: 'https://acme.com/sitemap.xml',
    });
    expect(out.rootUrl).toBe('https://acme.com');
  });

  it('createSiteSchema rejects http-less url', () => {
    expect(() => createSiteSchema.parse({ name: 'A', rootUrl: 'acme.com' })).toThrow();
  });

  it('createSiteSchema rejects empty / overlong name', () => {
    expect(() => createSiteSchema.parse({ name: '', rootUrl: 'https://a.test' })).toThrow();
    expect(() =>
      createSiteSchema.parse({ name: 'x'.repeat(81), rootUrl: 'https://a.test' }),
    ).toThrow();
  });

  it('updateSiteSchema accepts partial updates', () => {
    expect(updateSiteSchema.parse({ name: 'New' })).toEqual({ name: 'New' });
    expect(updateSiteSchema.parse({})).toEqual({});
  });

  it('createGenerationSchema accepts siteId-shape', () => {
    const out = createGenerationSchema.parse({ siteId: 7, notifyEmail: true });
    expect(out).toEqual({ siteId: 7, notifyEmail: true });
  });

  it('createGenerationSchema accepts inline-site-shape', () => {
    const out = createGenerationSchema.parse({
      name: 'Acme',
      rootUrl: 'https://Acme.com',
    });
    expect((out as any).rootUrl).toBe('https://acme.com');
  });

  it('createGenerationSchema rejects mixed shape', () => {
    expect(() =>
      createGenerationSchema.parse({
        siteId: 1,
        name: 'A',
        rootUrl: 'https://a.test',
      } as any),
    ).toThrow();
  });

  it('webhookBodySchema strips unknown keys including notify', () => {
    const out = webhookBodySchema.parse({ notify: true, weird: 'x' });
    expect(out).toEqual({});
  });
});
