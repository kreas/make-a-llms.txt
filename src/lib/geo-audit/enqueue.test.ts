import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users, siteGeoAudits } from '@/db/schema';
import { eq } from 'drizzle-orm';

vi.mock('workflow/api', () => ({ start: vi.fn() }));
vi.mock('@/lib/workflow/geo-audit-workflow', () => ({ runGeoAuditWorkflow: vi.fn() }));

import { start } from 'workflow/api';
import { enqueueGeoAudit } from './enqueue';

async function seedSite(email: string) {
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'U', email }).returning();
  const [s] = await db.insert(sites).values({
    userId: u.id, name: 'Acme', rootUrl: 'https://acme.test',
    webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_acme',
  }).returning();
  return s;
}

describe('enqueueGeoAudit', () => {
  beforeEach(async () => { vi.clearAllMocks(); await setupTestDb(); });

  it('starts the workflow and stores the runId', async () => {
    const s = await seedSite('a@a.test');
    vi.mocked(start).mockResolvedValue({ runId: 'run-1' } as never);
    const row = await enqueueGeoAudit({ siteId: s.id, siteType: 'saas', goal: 'get-cited' });
    expect(row.status).toBe('pending');
    expect(row.workflowRunId).toBe('run-1');
  });

  it('marks the row failed when start() throws (no stuck-pending row)', async () => {
    const s = await seedSite('b@b.test');
    vi.mocked(start).mockRejectedValue(new Error('queue down'));
    const row = await enqueueGeoAudit({ siteId: s.id, siteType: 'saas', goal: 'get-cited' });
    expect(row.status).toBe('failed');
    expect(row.errorReason).toBe('enqueue_failed');
    const [stored] = await getDb().select().from(siteGeoAudits).where(eq(siteGeoAudits.id, (await getDb().select().from(siteGeoAudits))[0].id));
    expect(stored.status).toBe('failed');
  });
});
