import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users, apiTokens } from '@/db/schema';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));

import { GET, POST } from './route';
import { getCurrentUser } from '@/lib/auth';

function jsonReq(body: unknown) {
  return new Request('http://t/api/api-tokens', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/api-tokens', () => {
  beforeEach(async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    vi.mocked(getCurrentUser).mockResolvedValue(u);
  });

  it('creates a token and returns the raw token exactly once', async () => {
    const res = await POST(jsonReq({ name: 'CI' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.token).toMatch(/^mklt_pat_/);
    expect(body.record.name).toBe('CI');
    expect(body.record.tokenPrefix.length).toBe(12);
  });

  it('honors expiresInDays', async () => {
    const res = await POST(jsonReq({ name: 'CI', expiresInDays: 30 }));
    const body = await res.json();
    expect(body.record.expiresAt).toBeTruthy();
  });

  it('400 on missing name', async () => {
    const res = await POST(jsonReq({}));
    expect(res.status).toBe(400);
  });

  it('401 when not signed in', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    const res = await POST(jsonReq({ name: 'CI' }));
    expect(res.status).toBe(401);
  });
});

describe('GET /api/api-tokens', () => {
  it('lists current user tokens without the raw token', async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    vi.mocked(getCurrentUser).mockResolvedValue(u);
    await db.insert(apiTokens).values({
      userId: u.id,
      name: 'one',
      tokenHash: 'h'.repeat(43),
      tokenPrefix: 'mklt_pat_xx',
    });
    const res = await GET();
    const body = await res.json();
    expect(body.tokens).toHaveLength(1);
    expect(body.tokens[0]).not.toHaveProperty('tokenHash');
    expect(body.tokens[0]).not.toHaveProperty('token');
  });
});
