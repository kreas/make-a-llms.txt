import { describe, it, expect, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users } from '@/db/schema';
import { createWebhookToken } from '@/lib/webhook-token';
import { generateUid } from '@/lib/uid';

vi.mock('workflow/api', () => ({
  start: vi.fn(async () => ({ runId: 'wf-1' })),
}));

import { POST } from './route';

const ctx = (siteUid: string) => ({ params: Promise.resolve({ siteId: siteUid }) });

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
  it('202 with generation shape using uids', async () => {
    const { site, token } = await setup();
    const res = await POST(tokenReq(token), ctx(site.uid));
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.generation.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.generation.siteId).toBe(site.uid);
    expect(body.generation.trigger).toBe('webhook');
    expect(body.generation.status).toBeDefined();
    expect(body.generation.createdAt).toBeDefined();
  });

  it('401 on missing token', async () => {
    const { site } = await setup();
    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(site.uid));
    expect(res.status).toBe(401);
  });

  it('401 on invalid webhook token', async () => {
    const { site } = await setup();
    const res = await POST(tokenReq('lmt_wrong'), ctx(site.uid));
    expect(res.status).toBe(401);
  });

  it('400 for non-UUID siteId', async () => {
    const { token } = await setup();
    const res = await POST(tokenReq(token), ctx('not-a-uuid'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('validation');
  });

  it('404 for unknown site uid', async () => {
    const { token } = await setup();
    const res = await POST(tokenReq(token), ctx(generateUid()));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('not_found');
  });

  it('dedupe sets X-Dedup: hit', async () => {
    const { site, token } = await setup();
    await POST(tokenReq(token), ctx(site.uid));
    const second = await POST(tokenReq(token), ctx(site.uid));
    expect(second.status).toBe(202);
    expect(second.headers.get('x-dedup')).toBe('hit');
  });
});
