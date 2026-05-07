import { describe, it, expect, beforeEach, vi } from 'vitest';
import { discoverSitemap } from './sitemap-discover';

describe('discoverSitemap', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFetch(map: Record<string, { status: number; body?: string }>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const m = map[url];
        if (!m) return new Response('', { status: 404 });
        return new Response(m.body ?? '', { status: m.status });
      }),
    );
  }

  it('returns /sitemap.xml when present', async () => {
    mockFetch({
      'https://x.test/sitemap.xml': { status: 200, body: '<urlset><url><loc>x</loc></url></urlset>' },
    });
    expect(await discoverSitemap('https://x.test')).toBe('https://x.test/sitemap.xml');
  });

  it('falls back to /sitemap_index.xml', async () => {
    mockFetch({
      'https://x.test/sitemap.xml': { status: 404 },
      'https://x.test/sitemap_index.xml': { status: 200, body: '<sitemapindex></sitemapindex>' },
    });
    expect(await discoverSitemap('https://x.test')).toBe('https://x.test/sitemap_index.xml');
  });

  it('falls back to robots.txt Sitemap directive', async () => {
    mockFetch({
      'https://x.test/sitemap.xml': { status: 404 },
      'https://x.test/sitemap_index.xml': { status: 404 },
      'https://x.test/robots.txt': {
        status: 200,
        body: 'User-agent: *\nSitemap: https://x.test/custom-sitemap.xml\n',
      },
      'https://x.test/custom-sitemap.xml': { status: 200, body: '<urlset></urlset>' },
    });
    expect(await discoverSitemap('https://x.test')).toBe('https://x.test/custom-sitemap.xml');
  });

  it('throws when nothing is found', async () => {
    mockFetch({});
    await expect(discoverSitemap('https://x.test')).rejects.toThrow(/No sitemap/);
  });
});
