import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadSitemapUrls } from './sitemap-urls';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const URLSET = (urls: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><urlset>${urls.map((u) => `<url><loc>${u}</loc></url>`).join('')}</urlset>`;
const INDEX = (sitemaps: string[]) =>
  `<?xml version="1.0" encoding="UTF-8"?><sitemapindex>${sitemaps.map((u) => `<sitemap><loc>${u}</loc></sitemap>`).join('')}</sitemapindex>`;

function okResponse(body: string): Response {
  return new Response(body, { status: 200 });
}

describe('loadSitemapUrls', () => {
  beforeEach(() => fetchMock.mockReset());

  it('parses a flat urlset', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(URLSET(['https://a.test/x', 'https://a.test/y'])));
    const out = await loadSitemapUrls('https://a.test/sitemap.xml');
    expect(out).toEqual(['https://a.test/x', 'https://a.test/y']);
  });

  it('follows a sitemap index one level deep', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse(INDEX(['https://a.test/s1.xml', 'https://a.test/s2.xml'])))
      .mockResolvedValueOnce(okResponse(URLSET(['https://a.test/x'])))
      .mockResolvedValueOnce(okResponse(URLSET(['https://a.test/y'])));
    const out = await loadSitemapUrls('https://a.test/sitemap.xml');
    expect(out.sort()).toEqual(['https://a.test/x', 'https://a.test/y']);
  });

  it('throws when the sitemap fetch fails', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 404 }));
    await expect(loadSitemapUrls('https://a.test/sitemap.xml')).rejects.toThrow(/404/);
  });

  it('returns urls in insertion order, deduped', async () => {
    fetchMock.mockResolvedValueOnce(okResponse(URLSET(['https://a.test/x', 'https://a.test/x'])));
    const out = await loadSitemapUrls('https://a.test/sitemap.xml');
    expect(out).toEqual(['https://a.test/x']);
  });
});
