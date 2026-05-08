import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, generations, users } from '@/db/schema';
import { eq } from 'drizzle-orm';

vi.mock('workflow/api', () => ({
  start: vi.fn(async () => ({ runId: 'wf-run-1' })),
}));

import { enqueueGenerationsForSite } from './enqueue-generations';

describe('enqueueGenerationsForSite', () => {
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
        rootUrl: 'https://x.test',
        webhookTokenHash: 'a'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();
    siteId = s.id;
  });

  it('inserts a pending generation and stores the workflowRunId', async () => {
    const g = await enqueueGenerationsForSite(siteId, { trigger: 'manual' });
    expect(g.status).toBe('pending');
    expect(g.workflowRunId).toBe('wf-run-1');
    expect(g.notifyEmail).toBe(false);
  });

  it('webhook trigger forces notifyEmail=true', async () => {
    const g = await enqueueGenerationsForSite(siteId, { trigger: 'webhook' });
    expect(g.notifyEmail).toBe(true);
    expect(g.trigger).toBe('webhook');
  });

  it('returns existing in-flight generation on dedupe', async () => {
    const first = await enqueueGenerationsForSite(siteId, { trigger: 'manual' });
    const second = await enqueueGenerationsForSite(siteId, { trigger: 'manual' });
    expect(second.id).toBe(first.id);
  });

  it('does not dedupe against terminal generations', async () => {
    const first = await enqueueGenerationsForSite(siteId, { trigger: 'manual' });
    await getDb()
      .update(generations)
      .set({ status: 'succeeded' })
      .where(eq(generations.id, first.id));

    const second = await enqueueGenerationsForSite(siteId, { trigger: 'manual' });
    expect(second.id).not.toBe(first.id);
  });
});
