import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users } from '@/db/schema';
import { eq } from 'drizzle-orm';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/geo-audit/enqueue', () => ({ enqueueGeoAudit: vi.fn() }));

import { getCurrentUser } from '@/lib/auth';
import { enqueueGeoAudit } from '@/lib/geo-audit/enqueue';
import { POST } from './route';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function makeSite(email: string) {
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'X', email }).returning();
  const [s] = await db.insert(sites).values({
    userId: u.id, name: 'S', rootUrl: 'https://s.test',
    webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_xxxx',
  }).returning();
  return { user: u, site: s };
}

describe('POST /api/sites/[id]/geo-audit', () => {
  beforeEach(async () => { vi.clearAllMocks(); await setupTestDb(); });

  it('401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await POST(new Request('http://t', { method: 'POST', body: '{}' }), ctx('00000000-0000-0000-0000-000000000000'));
    expect(res.status).toBe(401);
  });

  it('400 on an invalid body', async () => {
    const { user, site } = await makeSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const res = await POST(new Request('http://t', { method: 'POST', body: JSON.stringify({ siteType: 'bogus', goal: 'get-cited' }) }), ctx(site.uid));
    expect(res.status).toBe(400);
  });

  it('persists type/goal on the site and enqueues the audit', async () => {
    const { user, site } = await makeSite('b@b.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(enqueueGeoAudit).mockResolvedValue({
      uid: 'geo-1', status: 'pending', stage: null, siteType: 'saas', goal: 'get-cited',
      score: null, tier: null, fetchedAt: '2026-06-02T00:00:00Z', llmMsUsed: null,
      errorReason: null, errorMessage: null, results: null,
    } as never);

    const res = await POST(new Request('http://t', { method: 'POST', body: JSON.stringify({ siteType: 'saas', goal: 'get-cited' }) }), ctx(site.uid));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.audit.status).toBe('pending');
    expect(vi.mocked(enqueueGeoAudit)).toHaveBeenCalledWith({ siteId: site.id, siteType: 'saas', goal: 'get-cited' });
    const [updated] = await getDb().select().from(sites).where(eq(sites.id, site.id));
    expect(updated.siteType).toBe('saas');
    expect(updated.geoGoal).toBe('get-cited');
  });
});
