import { describe, it, expect } from 'vitest';
import { setupTestDb } from '@/test/db';
import { users, sites } from '@/db/schema';
import { getSiteByUid, listSitesForUser, toPublicSite } from './sites';

async function seedUser() {
  const db = await setupTestDb();
  const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
  return { db, u };
}

describe('sites service', () => {
  it('getSiteByUid returns the site for the owner', async () => {
    const { db, u } = await seedUser();
    const [s] = await db
      .insert(sites)
      .values({
        userId: u.id,
        name: 'S',
        rootUrl: 'https://s.test',
        webhookTokenHash: 'h'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();
    const got = await getSiteByUid(s.uid, u.id);
    expect(got?.id).toBe(s.id);
  });

  it('getSiteByUid returns null for non-owner', async () => {
    const { db, u } = await seedUser();
    const [other] = await db.insert(users).values({ name: 'B', email: 'b@b.test' }).returning();
    const [s] = await db
      .insert(sites)
      .values({
        userId: u.id,
        name: 'S',
        rootUrl: 'https://s.test',
        webhookTokenHash: 'h'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();
    const got = await getSiteByUid(s.uid, other.id);
    expect(got).toBeNull();
  });

  it('listSitesForUser scopes to the user', async () => {
    const { db, u } = await seedUser();
    const [other] = await db.insert(users).values({ name: 'B', email: 'b@b.test' }).returning();
    await db
      .insert(sites)
      .values({
        userId: u.id,
        name: 'Mine',
        rootUrl: 'https://mine.test',
        webhookTokenHash: 'h'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      });
    await db
      .insert(sites)
      .values({
        userId: other.id,
        name: 'Theirs',
        rootUrl: 'https://theirs.test',
        webhookTokenHash: 'i'.repeat(64),
        webhookTokenPrefix: 'lmt_bbbb',
      });
    const rows = await listSitesForUser(u.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Mine');
  });

  it('toPublicSite exposes uid as id', async () => {
    const { db, u } = await seedUser();
    const [s] = await db
      .insert(sites)
      .values({
        userId: u.id,
        name: 'S',
        rootUrl: 'https://s.test',
        webhookTokenHash: 'h'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();
    const pub = toPublicSite(s);
    expect(pub.id).toBe(s.uid);
    expect('userId' in pub).toBe(false);
    expect('webhookTokenHash' in pub).toBe(false);
  });
});
