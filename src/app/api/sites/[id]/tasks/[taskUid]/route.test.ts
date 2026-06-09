import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users, siteTasks } from '@/db/schema';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));

import { PATCH } from './route';
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

const ctx = (id: string, taskUid: string) => ({ params: Promise.resolve({ id, taskUid }) });

function patchReq(body: unknown) {
  return new Request('http://t', { method: 'PATCH', body: JSON.stringify(body) });
}

async function makeTask(siteId: number, status: 'open' | 'done' | 'verified' | 'wont_do' = 'open') {
  const [t] = await getDb()
    .insert(siteTasks)
    .values({
      siteId, sourceType: 'citation-check', sourceId: `c-${status}`,
      pageUrl: 'https://x.com/p', title: 'T', status,
      statusChangedAt: '2026-06-01T00:00:00Z',
    })
    .returning();
  return t;
}

beforeEach(async () => {
  await setupTestDb();
});

describe('PATCH /api/sites/[id]/tasks/[taskUid]', () => {
  it('returns 401 when unauthenticated', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    const task = await makeTask(site.id);
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await PATCH(patchReq({ status: 'done' }), ctx(site.uid, task.uid));
    expect(res.status).toBe(401);
  });

  it("returns 404 for a task on another user's site", async () => {
    const { site } = await makeUserAndSite('a@a.test');
    const { user: other } = await makeUserAndSite('b@b.test');
    const task = await makeTask(site.id);
    vi.mocked(getCurrentUser).mockResolvedValue(other);
    const res = await PATCH(patchReq({ status: 'done' }), ctx(site.uid, task.uid));
    expect(res.status).toBe(404);
  });

  it('returns 404 for an unknown task uid', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const res = await PATCH(
      patchReq({ status: 'done' }),
      ctx(site.uid, '00000000-0000-4000-8000-000000000000'),
    );
    expect(res.status).toBe(404);
  });

  it('rejects status verified with 400', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    const task = await makeTask(site.id);
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const res = await PATCH(patchReq({ status: 'verified' }), ctx(site.uid, task.uid));
    expect(res.status).toBe(400);
  });

  it('rejects a missing body with 400', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    const task = await makeTask(site.id);
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const res = await PATCH(new Request('http://t', { method: 'PATCH' }), ctx(site.uid, task.uid));
    expect(res.status).toBe(400);
  });

  it('marks a task done and bumps statusChangedAt', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    const task = await makeTask(site.id);
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const res = await PATCH(patchReq({ status: 'done' }), ctx(site.uid, task.uid));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.task.status).toBe('done');
    expect(body.task.statusChangedAt).not.toBe(task.statusChangedAt);
  });

  it('reopens a verified task (regression case)', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    const task = await makeTask(site.id, 'verified');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const res = await PATCH(patchReq({ status: 'open' }), ctx(site.uid, task.uid));
    const body = await res.json();
    expect(body.task.status).toBe('open');
  });
});
