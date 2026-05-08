import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users } from '@/db/schema';
import { createWebhookToken } from '@/lib/webhook-token';

vi.mock('workflow/api', () => ({
  start: vi.fn(async () => ({ runId: 'wf-1' })),
}));

import { POST } from './route';

const ctx = (siteId: number) => ({ params: Promise.resolve({ siteId: String(siteId) }) });

async function setup() {
  await setupTestDb();
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
  const tok = createWebhookToken();
  const [s] = await db
    .insert(sites)
    .values({
      userId: u.id,
      name: 'S',
      rootUrl: 'https://s.test',
      webhookTokenHash: tok.hash,
      webhookTokenPrefix: tok.prefix,
    })
    .returning();
  return { user: u, site: s, token: tok.token };
}

function tokenReq(token: string) {
  return new Request('http://t', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
}

describe('webhook regenerate', () => {
  it('202 with generation, notifyEmail forced true', async () => {
    const { site, token } = await setup();
    const res = await POST(tokenReq(token), ctx(site.id));
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.generation.notifyEmail).toBe(true);
    expect(body.generation.trigger).toBe('webhook');
  });

  it('401 on missing token', async () => {
    const { site } = await setup();
    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(site.id));
    expect(res.status).toBe(401);
  });

  it('401 on bad token', async () => {
    const { site } = await setup();
    const res = await POST(tokenReq('lmt_wrong'), ctx(site.id));
    expect(res.status).toBe(401);
  });

  it('404 on unknown siteId', async () => {
    const { token } = await setup();
    const res = await POST(tokenReq(token), ctx(999_999));
    expect(res.status).toBe(404);
  });

  it('dedupe sets X-Dedup: hit', async () => {
    const { site, token } = await setup();
    await POST(tokenReq(token), ctx(site.id));
    const second = await POST(tokenReq(token), ctx(site.id));
    expect(second.status).toBe(202);
    expect(second.headers.get('x-dedup')).toBe('hit');
  });
});
