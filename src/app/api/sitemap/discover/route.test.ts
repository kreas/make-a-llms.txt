import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/sitemap-discover', () => ({
  discoverSitemap: vi.fn(),
}));

import { POST } from './route';
import { getCurrentUser } from '@/lib/auth';
import { discoverSitemap } from '@/lib/sitemap-discover';

function jsonReq(body: unknown) {
  return new Request('http://t/api/sitemap/discover', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/sitemap/discover', () => {
  beforeEach(() => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 1,
      name: 'A',
      email: 'a@a.test',
      role: 'user',
      createdAt: 't',
      updatedAt: 't',
    });
  });

  it('returns 200 with the discovered sitemap URL', async () => {
    vi.mocked(discoverSitemap).mockResolvedValueOnce('https://acme.com/sitemap.xml');
    const res = await POST(jsonReq({ rootUrl: 'https://acme.com' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sitemapUrl).toBe('https://acme.com/sitemap.xml');
    expect(vi.mocked(discoverSitemap)).toHaveBeenCalledWith('https://acme.com');
  });

  it('normalizes the rootUrl to origin before discovery', async () => {
    vi.mocked(discoverSitemap).mockResolvedValueOnce('https://acme.com/sitemap.xml');
    await POST(jsonReq({ rootUrl: 'https://Acme.com/some/path?x=1' }));
    expect(vi.mocked(discoverSitemap)).toHaveBeenCalledWith('https://acme.com');
  });

  it('returns 404 when discovery throws', async () => {
    vi.mocked(discoverSitemap).mockRejectedValueOnce(new Error('No sitemap found.'));
    const res = await POST(jsonReq({ rootUrl: 'https://acme.com' }));
    expect(res.status).toBe(404);
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
