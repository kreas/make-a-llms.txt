import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Readable } from 'node:stream';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { eq } from 'drizzle-orm';
import { sites, generations, users } from '@/db/schema';

vi.mock('execa', () => ({
  execa: vi.fn(() => {
    const promise: any = Promise.resolve({ stdout: '# x\n', stderr: '', exitCode: 0 });
    promise.stdout = Readable.from([Buffer.from('# x\n')]);
    promise.stderr = Readable.from([]);
    return promise;
  }),
}));
vi.mock('@/lib/blob', () => ({
  put: vi.fn(async (pathname: string) => ({
    url: `https://blob.test/${pathname}`,
    pathname,
  })),
}));
vi.mock('@/lib/sitemap-discover', () => ({
  discoverSitemap: vi.fn(async () => 'https://x.test/sitemap.xml'),
}));

import { generateSiteFilesWorkflow } from './generate-site-files';

describe('generateSiteFilesWorkflow', () => {
  let generationId: number;

  beforeEach(async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const [s] = await db
      .insert(sites)
      .values({
        userId: u.id,
        name: 'S',
        rootUrl: 'https://x.test',
        webhookTokenHash: 'a'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();
    const [g] = await db
      .insert(generations)
      .values({ siteId: s.id, userId: u.id, trigger: 'manual' })
      .returning();
    generationId = g.id;
  });

  it('runs prepare → (runGen + runFull) → complete and ends in succeeded', async () => {
    const db = getDb();
    const [s] = await db.select().from(sites).limit(1);
    await generateSiteFilesWorkflow({ generationId });
    const [g] = await db
      .select()
      .from(generations)
      .where(eq(generations.id, generationId));
    expect(g.status).toBe('succeeded');
    expect(g.llmsBlobPath).toBe(`projects/${s.uid}/${g.uid}/llms.txt`);
    expect(g.llmsFullBlobPath).toBe(`projects/${s.uid}/${g.uid}/llms-full.txt`);
  });

  it('marks generation failed when a step throws', async () => {
    const mod = await import('@/lib/sitemap-discover');
    vi.mocked(mod.discoverSitemap).mockRejectedValueOnce(new Error('No sitemap found'));

    await generateSiteFilesWorkflow({ generationId });
    const [g] = await getDb()
      .select()
      .from(generations)
      .where(eq(generations.id, generationId));
    expect(g.status).toBe('failed');
    expect(g.errorMessage).toMatch(/No sitemap found/);
  });
});
