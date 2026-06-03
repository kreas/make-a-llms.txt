import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users, siteGeoAudits } from '@/db/schema';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));

import { getCurrentUser } from '@/lib/auth';
import { GET } from './route';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function makeUserAndSite(email: string) {
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'X', email }).returning();
  const [s] = await db.insert(sites).values({
    userId: u.id, name: 'S', rootUrl: 'https://s.test',
    webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_xxxx',
  }).returning();
  return { user: u, site: s };
}

describe('GET /api/sites/[id]/geo-audit/latest', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  it('401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(new Request('http://t'), ctx('00000000-0000-0000-0000-000000000000'));
    expect(res.status).toBe(401);
  });

  it('returns null when no audit exists', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const res = await GET(new Request('http://t'), ctx(site.uid));
    const body = await res.json();
    expect(body.audit).toBeNull();
  });

  it('prefers the latest succeeded audit over a newer failed one', async () => {
    const { user, site } = await makeUserAndSite('b@b.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const db = getDb();
    // older succeeded
    await db.insert(siteGeoAudits).values({
      siteId: site.id, status: 'succeeded', score: 70, tier: 'good',
      results: JSON.stringify({ score: 70, tier: 'good', signals: [], metadata: { pagesScanned: 1, candidates: 0, confirmCalls: 0 } }),
      trigger: 'manual', fetchedAt: '2026-06-01T00:00:00Z',
    });
    // newer failed
    await db.insert(siteGeoAudits).values({
      siteId: site.id, status: 'failed', errorReason: 'analysis_failed', errorMessage: 'boom',
      trigger: 'manual', fetchedAt: '2026-06-02T00:00:00Z',
    });

    const res = await GET(new Request('http://t'), ctx(site.uid));
    const body = await res.json();
    expect(body.audit.status).toBe('succeeded');
    expect(body.audit.score).toBe(70);
  });
});
