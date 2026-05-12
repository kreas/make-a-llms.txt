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

  it('parses CDATA-wrapped locs', async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse(
        `<?xml version="1.0" encoding="UTF-8"?><urlset>
          <url><loc><![CDATA[https://a.test/cdata]]></loc></url>
          <url><loc>https://a.test/plain</loc></url>
        </urlset>`,
      ),
    );
    const out = await loadSitemapUrls('https://a.test/sitemap.xml');
    expect(out).toEqual(['https://a.test/cdata', 'https://a.test/plain']);
  });

  it('handles two concurrent calls without cross-talk', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse(URLSET(['https://a.test/x1', 'https://a.test/x2'])))
      .mockResolvedValueOnce(okResponse(URLSET(['https://b.test/y1', 'https://b.test/y2'])));
    const [a, b] = await Promise.all([
      loadSitemapUrls('https://a.test/s.xml'),
      loadSitemapUrls('https://b.test/s.xml'),
    ]);
    expect(a).toEqual(['https://a.test/x1', 'https://a.test/x2']);
    expect(b).toEqual(['https://b.test/y1', 'https://b.test/y2']);
  });
});
