import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users } from '@/db/schema';
import { eq } from 'drizzle-orm';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/site-metadata/extract', () => ({
  extractSiteMetadata: vi.fn(),
}));

import { POST } from './route';
import { getCurrentUser } from '@/lib/auth';
import { extractSiteMetadata } from '@/lib/site-metadata/extract';

async function makeUserAndSite(email: string) {
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'A', email }).returning();
  const prefix = email.split('@')[0].slice(0, 4).padEnd(4, 'x');
  const hash = prefix.repeat(16);
  const [s] = await db
    .insert(sites)
    .values({
      userId: u.id,
      name: 'hopdoddy.com',
      rootUrl: `https://${email.split('@')[0]}.test`,
      webhookTokenHash: hash,
      webhookTokenPrefix: `lmt_${prefix}`,
    })
    .returning();
  return { user: u, site: s };
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe('POST /api/sites/[id]/refresh-metadata', () => {
  beforeEach(async () => {
    await setupTestDb();
    vi.mocked(extractSiteMetadata).mockReset();
  });

  it('persists extracted metadata and returns the updated site', async () => {
    vi.mocked(extractSiteMetadata).mockResolvedValue({
      ok: true,
      metadata: {
        name: 'Hopdoddy',
        description: 'Austin-born burger chain.',
        faviconUrl: 'https://hopdoddy.com/favicon.ico',
      },
    });
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(site.uid));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.site.displayName).toBe('Hopdoddy');
    expect(body.site.description).toBe('Austin-born burger chain.');
    expect(body.site.faviconUrl).toBe('https://hopdoddy.com/favicon.ico');

    const [row] = await getDb().select().from(sites).where(eq(sites.id, site.id));
    expect(row.displayName).toBe('Hopdoddy');
    expect(row.metadataFetchedAt).not.toBeNull();
  });

  it('returns 502 when extraction fails', async () => {
    vi.mocked(extractSiteMetadata).mockResolvedValue({
      ok: false,
      reason: 'fetch',
      message: 'HTTP 503',
    });
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(site.uid));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe('extraction_failed');
  });

  it('returns 404 for cross-tenant access', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    const { user: other } = await makeUserAndSite('b@b.test');
    vi.mocked(getCurrentUser).mockResolvedValue(other);

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(site.uid));
    expect(res.status).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(site.uid));
    expect(res.status).toBe(401);
  });
});
