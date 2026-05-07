import { describe, it, expect, beforeEach } from 'vitest';
import { setupTestDb } from './db';
import { sites, users } from '@/db/schema';
import { getDb } from '@/db';

describe('test db helper', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  it('migrates schema and round-trips a row', async () => {
    const db = getDb();

    const [u] = await db.insert(users).values({ name: 'T', email: 't@t.test' }).returning();
    const [s] = await db
      .insert(sites)
      .values({
        userId: u.id,
        name: 'Test',
        rootUrl: 'https://test.example',
        webhookTokenHash: 'a'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();

    expect(s.id).toBeGreaterThan(0);
    expect(s.userId).toBe(u.id);
  });
});
