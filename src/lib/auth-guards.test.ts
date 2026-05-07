import { describe, it, expect, beforeEach } from 'vitest';
import { setupTestDb } from '@/test/db';
import { sites, users } from '@/db/schema';
import { getDb } from '@/db';
import { assertOwnsSite, ApiError } from './auth-guards';

describe('auth-guards', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  it('assertOwnsSite returns the site for the owner', async () => {
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const [s] = await db
      .insert(sites)
      .values({
        userId: u.id,
        name: 'S',
        rootUrl: 'https://s.test',
        webhookTokenHash: 'a'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();

    const found = await assertOwnsSite(s.id, u.id);
    expect(found.id).toBe(s.id);
  });

  it('assertOwnsSite throws 404 for a different user', async () => {
    const db = getDb();
    const [u1] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const [u2] = await db.insert(users).values({ name: 'B', email: 'b@b.test' }).returning();
    const [s] = await db
      .insert(sites)
      .values({
        userId: u1.id,
        name: 'S',
        rootUrl: 'https://s.test',
        webhookTokenHash: 'a'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();

    await expect(assertOwnsSite(s.id, u2.id)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
  });

  it('assertOwnsSite throws 404 for missing site', async () => {
    await expect(assertOwnsSite(99999, 1)).rejects.toMatchObject({ status: 404 });
  });

  it('ApiError carries status and code', () => {
    const e = new ApiError(401, 'unauthenticated', 'Sign in required');
    expect(e.status).toBe(401);
    expect(e.code).toBe('unauthenticated');
    expect(e.message).toBe('Sign in required');
  });
});
