import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users, sites, apiTokens } from '@/db/schema';
import { createApiToken } from '@/lib/tokens/api-token';

vi.mock('workflow/api', () => ({ start: vi.fn(async () => ({ runId: 'wf-1' })) }));

import { POST } from './route';

function postReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://t/api/v1/generations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

async function seed() {
  await setupTestDb();
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
  const { token, hash, prefix } = createApiToken();
  await db.insert(apiTokens).values({
    userId: u.id, name: 'CI', tokenHash: hash, tokenPrefix: prefix,
  });
  return { user: u, token };
}

describe('POST /api/v1/generations', () => {
  it('401 when no bearer token', async () => {
    await setupTestDb();
    const res = await POST(postReq({ siteId: 1 }));
    expect(res.status).toBe(401);
  });

  it('400 when body fails validation', async () => {
    const { token } = await seed();
    const res = await POST(postReq({}, { authorization: `Bearer ${token}` }));
    expect(res.status).toBe(400);
  });

  it('201 with curated body for inline-site shape', async () => {
    const { token } = await seed();
    const res = await POST(
      postReq({ name: 'Acme', rootUrl: 'https://acme.test' }, { authorization: `Bearer ${token}` }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.generation.urls.self).toMatch(/\/api\/v1\/generations\/\d+$/);
    expect(body.generation.urls.llms).toMatch(/\/llms\.txt$/);
  });

  it('201 for an existing siteId owned by the user', async () => {
    const { user, token } = await seed();
    const db = getDb();
    const [s] = await db
      .insert(sites)
      .values({ userId: user.id, name: 'S', rootUrl: 'https://s.test', webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_aaaa' })
      .returning();
    const res = await POST(postReq({ siteId: s.id }, { authorization: `Bearer ${token}` }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.generation.siteId).toBe(s.id);
  });

  it('404 when siteId is not owned', async () => {
    const { token } = await seed();
    const db = getDb();
    const [other] = await db.insert(users).values({ name: 'O', email: 'o@o.test' }).returning();
    const [s] = await db
      .insert(sites)
      .values({ userId: other.id, name: 'X', rootUrl: 'https://x.test', webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_bbbb' })
      .returning();
    const res = await POST(postReq({ siteId: s.id }, { authorization: `Bearer ${token}` }));
    expect(res.status).toBe(404);
  });

  it('normalizes rootUrl host to lowercase on inline create', async () => {
    const { user, token } = await seed();
    const db = getDb();
    // pre-create a site with normalized rootUrl
    await db.insert(sites).values({
      userId: user.id,
      name: 'Acme',
      rootUrl: 'https://acme.test',
      webhookTokenHash: 'h'.repeat(64),
      webhookTokenPrefix: 'lmt_aaaa',
    });
    const before = await db.select().from(sites).where(eq(sites.userId, user.id));
    expect(before).toHaveLength(1);

    // post with uppercase host — should dedupe to the existing site
    const res = await POST(
      postReq({ name: 'Acme2', rootUrl: 'https://ACME.test/' }, { authorization: `Bearer ${token}` }),
    );
    expect(res.status).toBe(201);
    const after = await db.select().from(sites).where(eq(sites.userId, user.id));
    expect(after).toHaveLength(1); // dedupe worked
  });
});
