import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/sitemap-discover', () => ({
  discoverSitemap: vi.fn(),
}));
vi.mock('@/lib/homepage-check', () => ({
  checkHomepage: vi.fn(),
}));

import { POST } from './route';
import { getCurrentUser } from '@/lib/auth';
import { discoverSitemap } from '@/lib/sitemap-discover';
import { checkHomepage } from '@/lib/homepage-check';

function jsonReq(body: unknown) {
  return new Request('http://t/api/sitemap/preflight', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/sitemap/preflight', () => {
  beforeEach(() => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 1,
      uid: '00000000-0000-0000-0000-000000000001',
      name: 'A',
      email: 'a@a.test',
      role: 'user',
      createdAt: 't',
      updatedAt: 't',
    });
  });

  it('returns ok when the homepage is reachable and a sitemap is found', async () => {
    vi.mocked(checkHomepage).mockResolvedValueOnce(true);
    vi.mocked(discoverSitemap).mockResolvedValueOnce('https://acme.com/sitemap.xml');

    const res = await POST(jsonReq({ rootUrl: 'https://acme.com' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      homepageReachable: true,
      sitemapUrl: 'https://acme.com/sitemap.xml',
    });
    expect(vi.mocked(checkHomepage)).toHaveBeenCalledWith('https://acme.com');
    expect(vi.mocked(discoverSitemap)).toHaveBeenCalledWith('https://acme.com');
  });

  it('is not ok when the homepage is unreachable', async () => {
    vi.mocked(checkHomepage).mockResolvedValueOnce(false);
    vi.mocked(discoverSitemap).mockResolvedValueOnce('https://acme.com/sitemap.xml');

    const res = await POST(jsonReq({ rootUrl: 'https://acme.com' }));
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.homepageReachable).toBe(false);
  });

  it('is not ok and reports no sitemap when discovery fails', async () => {
    vi.mocked(checkHomepage).mockResolvedValueOnce(true);
    vi.mocked(discoverSitemap).mockRejectedValueOnce(new Error('No sitemap found.'));

    const res = await POST(jsonReq({ rootUrl: 'https://acme.com' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: false, homepageReachable: true, sitemapUrl: null });
  });

  it('normalizes the rootUrl to origin before checking', async () => {
    vi.mocked(checkHomepage).mockResolvedValueOnce(true);
    vi.mocked(discoverSitemap).mockResolvedValueOnce('https://acme.com/sitemap.xml');

    await POST(jsonReq({ rootUrl: 'https://Acme.com/some/path?x=1' }));
    expect(vi.mocked(checkHomepage)).toHaveBeenCalledWith('https://acme.com');
    expect(vi.mocked(discoverSitemap)).toHaveBeenCalledWith('https://acme.com');
  });

  it('returns 400 on invalid URL', async () => {
    const res = await POST(jsonReq({ rootUrl: 'not-a-url' }));
    expect(res.status).toBe(400);
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    const res = await POST(jsonReq({ rootUrl: 'https://acme.com' }));
    expect(res.status).toBe(401);
  });
});
