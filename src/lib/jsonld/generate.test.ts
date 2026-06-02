import { describe, it, expect } from 'vitest';
import { generateJsonLd } from './generate';

describe('generateJsonLd', () => {
  it('produces WebPage JSON-LD for a generic page', () => {
    const out = generateJsonLd({
      fields: { title: 'About | Acme', url: 'https://acme.com/about', page_type: 'about' },
      selectedPageUrl: 'https://acme.com/about',
    });
    const parsed = JSON.parse(out);
    expect(parsed['@type']).toBe('AboutPage');
    expect(parsed.url).toBe('https://acme.com/about');
  });

  it('produces BlogPosting for blog page_type with dates', () => {
    const out = generateJsonLd({
      fields: { title: 'Post | Acme', url: 'https://acme.com/blog/x', page_type: 'blog', updated: '2026-01-01' },
      selectedPageUrl: 'https://acme.com/blog/x',
    });
    const parsed = JSON.parse(out);
    expect(parsed['@type']).toBe('BlogPosting');
    expect(parsed.dateModified).toBe('2026-01-01');
  });

  it('derives image from the markdown body when no image field', () => {
    const out = generateJsonLd({
      fields: { title: 'Acme', url: 'https://acme.com/', page_type: 'other' },
      body: '![alt](/hero.png)',
      selectedPageUrl: 'https://acme.com/',
    });
    expect(JSON.parse(out).image).toBe('https://acme.com/hero.png');
  });
});
