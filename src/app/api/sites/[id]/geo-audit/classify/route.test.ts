import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users, pageSummaryCache } from '@/db/schema';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/geo-audit/classify', () => ({ classifyFromSignals: vi.fn() }));

import { getCurrentUser } from '@/lib/auth';
import { classifyFromSignals } from '@/lib/geo-audit/classify';
import { POST } from './route';

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function makeSite(email: string) {
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'X', email }).returning();
  const [s] = await db.insert(sites).values({
    userId: u.id, name: 'Acme', rootUrl: 'https://acme.test', description: 'A blog.',
    webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_acme',
  }).returning();
  return { user: u, site: s };
}

describe('POST /api/sites/[id]/geo-audit/classify', () => {
  beforeEach(async () => { vi.clearAllMocks(); await setupTestDb(); });

  it('401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await POST(new Request('http://t', { method: 'POST' }), ctx('00000000-0000-0000-0000-000000000000'));
    expect(res.status).toBe(401);
  });

  it('builds the histogram from page summaries and returns the classification', async () => {
    const { user, site } = await makeSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    await getDb().insert(pageSummaryCache).values([
      { siteId: site.id, urlPath: 'a', url: 'https://acme.test/a', contentHash: 'h1', summary: 's', pageType: 'article' },
      { siteId: site.id, urlPath: 'b', url: 'https://acme.test/b', contentHash: 'h2', summary: 's', pageType: 'article' },
      { siteId: site.id, urlPath: 'c', url: 'https://acme.test/c', contentHash: 'h3', summary: 's', pageType: 'about' },
    ]);
    vi.mocked(classifyFromSignals).mockResolvedValue({ siteType: 'publisher', confidence: 0.9 });

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(site.uid));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestedType).toBe('publisher');
    expect(body.confidence).toBe(0.9);
    const arg = vi.mocked(classifyFromSignals).mock.calls[0][0];
    expect(arg.histogram.article).toBe(2);
  });
});
