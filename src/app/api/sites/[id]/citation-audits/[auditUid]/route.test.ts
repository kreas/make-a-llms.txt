import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users, citationAudits } from '@/db/schema';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));

import { GET } from './route';
import { getCurrentUser } from '@/lib/auth';

async function makeUserAndSite(email: string) {
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'X', email }).returning();
  const prefix = email.split('@')[0].slice(0, 4).padEnd(4, 'x');
  const hash = prefix.repeat(16);
  const [s] = await db
    .insert(sites)
    .values({
      userId: u.id,
      name: 'S',
      rootUrl: `https://${email.split('@')[0]}.test`,
      webhookTokenHash: hash,
      webhookTokenPrefix: `lmt_${prefix}`,
    })
    .returning();
  return { user: u, site: s };
}

const ctx = (id: string, auditUid: string) => ({ params: Promise.resolve({ id, auditUid }) });

const PAGE_URL = 'https://example.com/page';

describe('GET /api/sites/[id]/citation-audits/[auditUid]', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  it('returns 401 when unauthenticated', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await GET(new Request('http://t'), ctx(site.uid, crypto.randomUUID()));
    expect(res.status).toBe(401);
  });

  it('returns 404 for a non-existent audit uid', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const res = await GET(new Request('http://t'), ctx(site.uid, crypto.randomUUID()));
    expect(res.status).toBe(404);
  });

  it('returns 404 for cross-tenant (audit belongs to a different user\'s site)', async () => {
    const { site: siteA } = await makeUserAndSite('a@a.test');
    const { user: userB, site: siteB } = await makeUserAndSite('b@b.test');
    vi.mocked(getCurrentUser).mockResolvedValue(userB);

    // Insert an audit for siteA
    const [audit] = await getDb()
      .insert(citationAudits)
      .values({
        siteId: siteA.id,
        pageUrl: PAGE_URL,
        status: 'succeeded',
        trigger: 'manual',
      })
      .returning();

    // userB tries to access siteA's audit via their own siteB uid — should 404 on site lookup
    const res = await GET(new Request('http://t'), ctx(siteB.uid, audit.uid));
    expect(res.status).toBe(404);
  });

  it('returns 200 with the audit for the owner', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const [audit] = await getDb()
      .insert(citationAudits)
      .values({
        siteId: site.id,
        pageUrl: PAGE_URL,
        status: 'succeeded',
        trigger: 'manual',
      })
      .returning();

    const res = await GET(new Request('http://t'), ctx(site.uid, audit.uid));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.audit.id).toBe(audit.id);
    expect(body.audit.pageUrl).toBe(PAGE_URL);
  });
});
