import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users, generations, siteGeoAudits } from '@/db/schema';
import { eq } from 'drizzle-orm';

vi.mock('@/lib/blob', () => ({ get: vi.fn() }));
vi.mock('./confirm', () => ({ confirmCandidate: vi.fn() }));

import { get } from '@/lib/blob';
import { confirmCandidate } from './confirm';
import { runGeoAudit } from './run';

async function seed() {
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'U', email: 'u@u.test' }).returning();
  const [s] = await db.insert(sites).values({
    userId: u.id, name: 'Acme', rootUrl: 'https://acme.test',
    webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_acme',
  }).returning();
  const [g] = await db.insert(generations).values({
    siteId: s.id, userId: u.id, status: 'succeeded', trigger: 'manual',
    pagesManifestBlobPath: 'gens/1/pages/manifest.json',
  }).returning();
  return { site: s, gen: g };
}

function blobText(text: string) {
  return { stream: new Response(text).body };
}

describe('runGeoAudit', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupTestDb();
  });

  it('persists a succeeded audit from the latest generation pages', async () => {
    const { site } = await seed();
    const manifest = JSON.stringify({
      pages: [
        { url: 'https://acme.test/pricing', path: 'pricing', blobPath: 'b/pricing.md', status: 'ok' },
        { url: 'https://acme.test/about', path: 'about', blobPath: 'b/about.md', status: 'ok' },
      ],
    });
    vi.mocked(get).mockImplementation(async (p: string) => {
      if (p.endsWith('manifest.json')) return blobText(manifest) as never;
      if (p.endsWith('pricing.md')) return blobText('Plans from $29/mo.') as never;
      return blobText('Our story.') as never;
    });
    vi.mocked(confirmCandidate).mockResolvedValue({ confirmed: true, artifact: 'from $29/mo' });

    const row = await runGeoAudit({ siteId: site.id });

    expect(row.status).toBe('succeeded');
    expect(row.score).toBe(40); // pricing only
    const stored = await getDb().select().from(siteGeoAudits).where(eq(siteGeoAudits.siteId, site.id));
    expect(stored).toHaveLength(1);
  });

  it('fails gracefully when the site has no succeeded generation', async () => {
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'U', email: 'n@n.test' }).returning();
    const [s] = await db.insert(sites).values({
      userId: u.id, name: 'Empty', rootUrl: 'https://empty.test',
      webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_empt',
    }).returning();

    const row = await runGeoAudit({ siteId: s.id });
    expect(row.status).toBe('failed');
    expect(row.errorReason).toBe('no_generation');
  });

  it('persists a failed row when a confirm call rejects', async () => {
    const { site } = await seed();
    const manifest = JSON.stringify({
      pages: [{ url: 'https://acme.test/pricing', path: 'pricing', blobPath: 'b/pricing.md', status: 'ok' }],
    });
    vi.mocked(get).mockImplementation(async (p: string) => {
      if (p.endsWith('manifest.json')) return blobText(manifest) as never;
      return blobText('Plans from $29/mo.') as never;
    });
    vi.mocked(confirmCandidate).mockRejectedValue(new Error('rate limited'));

    const row = await runGeoAudit({ siteId: site.id });
    expect(row.status).toBe('failed');
    expect(row.errorReason).toBe('analysis_failed');
    expect(row.errorMessage).toContain('rate limited');
  });

  it('persists a failed row when the generation has no eligible pages', async () => {
    const { site } = await seed();
    const manifest = JSON.stringify({
      pages: [{ url: 'https://acme.test/x', path: 'x', blobPath: null, status: 'failed' }],
    });
    vi.mocked(get).mockImplementation(async (p: string) => {
      if (p.endsWith('manifest.json')) return blobText(manifest) as never;
      return null as never;
    });

    const row = await runGeoAudit({ siteId: site.id });
    expect(row.status).toBe('failed');
    expect(row.errorReason).toBe('no_pages');
  });
});
