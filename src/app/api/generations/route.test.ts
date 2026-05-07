import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users } from '@/db/schema';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('workflow/api', () => ({
  start: vi.fn(async () => ({ runId: 'wf-1' })),
}));

import { GET, POST } from './route';
import { getCurrentUser } from '@/lib/auth';

function jsonReq(body: any) {
  return new Request('http://t/api/generations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/generations', () => {
  let userId: number;
  let siteId: number;
  beforeEach(async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    userId = u.id;
    const [s] = await db
      .insert(sites)
      .values({
        userId,
        name: 'S',
        rootUrl: 'https://s.test',
        webhookTokenHash: 'a'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();
    siteId = s.id;
    vi.mocked(getCurrentUser).mockResolvedValue(u);
  });

  it('creates a generation for an existing site', async () => {
    const res = await POST(jsonReq({ siteId }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.generation.siteId).toBe(siteId);
    expect(body.generation.trigger).toBe('manual');
    expect(body.generation.notifyEmail).toBe(false);
  });

  it('honors notifyEmail flag', async () => {
    const res = await POST(jsonReq({ siteId, notifyEmail: true }));
    const body = await res.json();
    expect(body.generation.notifyEmail).toBe(true);
  });

  it('creates a site inline when payload has rootUrl', async () => {
    const res = await POST(jsonReq({ name: 'New', rootUrl: 'https://new.test' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.generation.siteId).not.toBe(siteId);
  });

  it('rejects mixing siteId and inline shape', async () => {
    const res = await POST(jsonReq({ siteId, name: 'X', rootUrl: 'https://x.test' }));
    expect(res.status).toBe(400);
  });

  it('404 when siteId is not owned', async () => {
    const db = getDb();
    const [other] = await db.insert(users).values({ name: 'O', email: 'o@o.test' }).returning();
    vi.mocked(getCurrentUser).mockResolvedValue(other);
    const res = await POST(jsonReq({ siteId }));
    expect(res.status).toBe(404);
  });
});

describe('GET /api/generations', () => {
  it("returns the caller's generations, optionally filtered by siteId", async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    vi.mocked(getCurrentUser).mockResolvedValue(u);

    await POST(jsonReq({ name: 'A', rootUrl: 'https://a.test' }));
    await POST(jsonReq({ name: 'B', rootUrl: 'https://b.test' }));

    const res = await GET(new Request('http://t/api/generations'));
    const body = await res.json();
    expect(body.generations.length).toBe(2);
  });
});
