import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users, siteTasks, citationAudits, siteGeoAudits } from '@/db/schema';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));

import { GET, POST } from './route';
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

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const CHECK_TASK = {
  sourceType: 'citation-check',
  sourceId: 'schema-type',
  pageUrl: 'https://x.com/about',
  title: 'Schema.org type',
  foundText: 'Unrecognized @type(s): JobPosting',
  fixText: 'Declare a Schema.org @type appropriate for this page.',
};

function postReq(body: unknown) {
  return new Request('http://t', { method: 'POST', body: JSON.stringify(body) });
}

beforeEach(async () => {
  await setupTestDb();
});

describe('POST /api/sites/[id]/tasks', () => {
  it('returns 401 when unauthenticated', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await POST(postReq(CHECK_TASK), ctx(site.uid));
    expect(res.status).toBe(401);
  });

  it('returns 404 for cross-tenant site', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    const { user: other } = await makeUserAndSite('b@b.test');
    vi.mocked(getCurrentUser).mockResolvedValue(other);
    const res = await POST(postReq(CHECK_TASK), ctx(site.uid));
    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid body', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const res = await POST(postReq({ sourceType: 'nope' }), ctx(site.uid));
    expect(res.status).toBe(400);
  });

  it('creates an open task', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const res = await POST(postReq(CHECK_TASK), ctx(site.uid));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.task.status).toBe('open');
    expect(body.task.sourceId).toBe('schema-type');
    expect(typeof body.task.id).toBe('string');
  });

  it('is idempotent: second POST for the same finding returns the existing task', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const first = await (await POST(postReq(CHECK_TASK), ctx(site.uid))).json();
    const second = await (await POST(postReq(CHECK_TASK), ctx(site.uid))).json();
    expect(second.task.id).toBe(first.task.id);
    const rows = await getDb().select().from(siteTasks);
    expect(rows).toHaveLength(1);
  });
});

describe('GET /api/sites/[id]/tasks', () => {
  it('returns 401 when unauthenticated', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(new Request('http://t'), ctx(site.uid));
    expect(res.status).toBe(401);
  });

  it('orders tasks open, done, verified, wont_do', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const db = getDb();
    const base = { siteId: site.id, sourceType: 'citation-check' as const, pageUrl: 'https://x.com/p', title: 'T' };
    await db.insert(siteTasks).values([
      { ...base, sourceId: 'c1', status: 'wont_do' },
      { ...base, sourceId: 'c2', status: 'open' },
      { ...base, sourceId: 'c3', status: 'done' },
      { ...base, sourceId: 'c4', status: 'verified' },
    ]);
    const res = await GET(new Request('http://t'), ctx(site.uid));
    const body = await res.json();
    expect(body.tasks.map((t: { status: string }) => t.status)).toEqual([
      'open', 'done', 'verified', 'wont_do',
    ]);
  });

  it('reconciles: flips an open citation task to verified when the latest audit passes the check', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const db = getDb();
    await db.insert(siteTasks).values({
      siteId: site.id, sourceType: 'citation-check', sourceId: 'schema-type',
      pageUrl: 'https://x.com/about', title: 'Schema.org type', status: 'open',
    });
    await db.insert(citationAudits).values({
      siteId: site.id, pageUrl: 'https://x.com/about', status: 'succeeded', trigger: 'manual',
      fetchedAt: '2026-06-09T00:00:00Z',
      results: JSON.stringify({ checks: [{ id: 'schema-type', passed: true }] }),
    });
    const res = await GET(new Request('http://t'), ctx(site.uid));
    const body = await res.json();
    expect(body.tasks[0].status).toBe('verified');
  });

  it('reconciles only against the LATEST audit for the page', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const db = getDb();
    await db.insert(siteTasks).values({
      siteId: site.id, sourceType: 'citation-check', sourceId: 'schema-type',
      pageUrl: 'https://x.com/about', title: 'Schema.org type', status: 'open',
    });
    // Older audit passes, newer audit fails: task must stay open.
    await db.insert(citationAudits).values([
      { siteId: site.id, pageUrl: 'https://x.com/about', status: 'succeeded', trigger: 'manual',
        fetchedAt: '2026-06-01T00:00:00Z',
        results: JSON.stringify({ checks: [{ id: 'schema-type', passed: true }] }) },
      { siteId: site.id, pageUrl: 'https://x.com/about', status: 'succeeded', trigger: 'manual',
        fetchedAt: '2026-06-08T00:00:00Z',
        results: JSON.stringify({ checks: [{ id: 'schema-type', passed: false }] }) },
    ]);
    const res = await GET(new Request('http://t'), ctx(site.uid));
    const body = await res.json();
    expect(body.tasks[0].status).toBe('open');
  });

  it('reconciles geo-signal tasks against the latest geo audit but never wont_do', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const db = getDb();
    await db.insert(siteTasks).values([
      { siteId: site.id, sourceType: 'geo-signal', sourceId: 'case-studies', title: 'Case studies', status: 'open' },
      { siteId: site.id, sourceType: 'geo-signal', sourceId: 'pricing-clarity', title: 'Pricing', status: 'wont_do' },
    ]);
    await db.insert(siteGeoAudits).values({
      siteId: site.id, status: 'succeeded', trigger: 'manual',
      fetchedAt: '2026-06-09T00:00:00Z',
      results: JSON.stringify({
        signals: [
          { signal: 'case-studies', present: true },
          { signal: 'pricing-clarity', present: true },
        ],
      }),
    });
    const res = await GET(new Request('http://t'), ctx(site.uid));
    const body = await res.json();
    const byId = Object.fromEntries(body.tasks.map((t: { sourceId: string; status: string }) => [t.sourceId, t.status]));
    expect(byId['case-studies']).toBe('verified');
    expect(byId['pricing-clarity']).toBe('wont_do');
  });

  it('skips reconciliation for a corrupt audit results blob instead of failing the request', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const db = getDb();
    await db.insert(siteTasks).values({
      siteId: site.id, sourceType: 'citation-check', sourceId: 'schema-type',
      pageUrl: 'https://x.com/about', title: 'Schema.org type', status: 'open',
    });
    await db.insert(citationAudits).values({
      siteId: site.id, pageUrl: 'https://x.com/about', status: 'succeeded', trigger: 'manual',
      fetchedAt: '2026-06-09T00:00:00Z',
      results: 'not-json{',
    });
    const res = await GET(new Request('http://t'), ctx(site.uid));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tasks[0].status).toBe('open');
  });
});
