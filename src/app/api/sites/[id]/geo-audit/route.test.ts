import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users } from '@/db/schema';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/geo-audit/run', () => ({ runGeoAudit: vi.fn() }));

import { getCurrentUser } from '@/lib/auth';
import { runGeoAudit } from '@/lib/geo-audit/run';
import { POST } from './route';

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

describe('POST /api/sites/[id]/geo-audit', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  it('401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await POST(new Request('http://t', { method: 'POST' }), ctx('00000000-0000-0000-0000-000000000000'));
    expect(res.status).toBe(401);
  });

  it('runs the audit and returns the serialized result', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(runGeoAudit).mockResolvedValue({
      uid: 'geo-1', status: 'succeeded', score: 70, tier: 'good',
      fetchedAt: '2026-06-02T00:00:00Z', llmMsUsed: 1000, errorReason: null, errorMessage: null,
      results: JSON.stringify({ score: 70, tier: 'good', signals: [], metadata: { pagesScanned: 1, candidates: 1, confirmCalls: 1 } }),
    } as never);

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(site.uid));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.audit.id).toBe('geo-1');
    expect(body.audit.score).toBe(70);
    expect(vi.mocked(runGeoAudit)).toHaveBeenCalledWith({ siteId: site.id });
  });
});
