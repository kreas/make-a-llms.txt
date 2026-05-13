import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users, robotsGeneratorDrafts } from '@/db/schema';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));

import { GET, PUT } from './route';
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

const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });

function putRequest(body: unknown) {
  return new Request('http://t', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/sites/[id]/generator-draft', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  it('returns 200 with the draft when it exists', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    await getDb()
      .insert(robotsGeneratorDrafts)
      .values({ siteId: site.id, toggles: '{"GPTBot":"block"}' });

    const res = await GET(new Request('http://t'), ctx(site.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.draft.toggles).toBe('{"GPTBot":"block"}');
  });

  it('returns 404 when no draft exists', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const res = await GET(new Request('http://t'), ctx(site.id));
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-owner', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    const { user: other } = await makeUserAndSite('b@b.test');
    vi.mocked(getCurrentUser).mockResolvedValue(other);
    const res = await GET(new Request('http://t'), ctx(site.id));
    expect(res.status).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(new Request('http://t'), ctx(site.id));
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/sites/[id]/generator-draft', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  it('creates a draft when none exists', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const res = await PUT(
      putRequest({ toggles: { GPTBot: 'block', ClaudeBot: 'allow' } }),
      ctx(site.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(JSON.parse(body.draft.toggles).GPTBot).toBe('block');
  });

  it('updates an existing draft (upsert)', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    await getDb()
      .insert(robotsGeneratorDrafts)
      .values({ siteId: site.id, toggles: '{"GPTBot":"block"}' });

    const res = await PUT(
      putRequest({ toggles: { GPTBot: 'allow' } }),
      ctx(site.id),
    );
    expect(res.status).toBe(200);
    const rows = await getDb().select().from(robotsGeneratorDrafts);
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].toggles).GPTBot).toBe('allow');
  });

  it('returns 400 for invalid body', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const res = await PUT(
      putRequest({ toggles: 'not-an-object' }),
      ctx(site.id),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 for a non-owner', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    const { user: other } = await makeUserAndSite('b@b.test');
    vi.mocked(getCurrentUser).mockResolvedValue(other);
    const res = await PUT(putRequest({ toggles: {} }), ctx(site.id));
    expect(res.status).toBe(404);
  });

  it('GET returns allowAll defaulting to false when not set', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    await getDb()
      .insert(robotsGeneratorDrafts)
      .values({ siteId: site.id, toggles: '{}' });
    const res = await GET(new Request('http://t'), ctx(site.id));
    const body = await res.json();
    expect(body.draft.allowAll).toBe(false);
  });

  it('PUT accepts allowAll: true and persists it', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const res = await PUT(
      putRequest({ toggles: {}, allowAll: true }),
      ctx(site.id),
    );
    expect(res.status).toBe(200);
    const rows = await getDb().select().from(robotsGeneratorDrafts);
    expect(rows).toHaveLength(1);
    expect(rows[0].allowAll).toBe(true);
  });

  it('PUT defaults allowAll to false when omitted', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const res = await PUT(putRequest({ toggles: {} }), ctx(site.id));
    expect(res.status).toBe(200);
    const rows = await getDb().select().from(robotsGeneratorDrafts);
    expect(rows[0].allowAll).toBe(false);
  });

  it('PUT upsert preserves allowAll across updates', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    // First PUT sets allowAll: true.
    await PUT(putRequest({ toggles: {}, allowAll: true }), ctx(site.id));
    // Second PUT omits allowAll (defaults to false).
    await PUT(putRequest({ toggles: { GPTBot: 'block' } }), ctx(site.id));

    const rows = await getDb().select().from(robotsGeneratorDrafts);
    expect(rows).toHaveLength(1);
    expect(rows[0].allowAll).toBe(false);
    expect(JSON.parse(rows[0].toggles).GPTBot).toBe('block');
  });
});
