import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Readable } from 'node:stream';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, generations, users } from '@/db/schema';
import { eq } from 'drizzle-orm';

vi.mock('execa', () => ({ execa: vi.fn() }));
vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (pathname: string) => ({
    url: `https://blob.test/${pathname}`,
    pathname,
  })),
}));
vi.mock('@/lib/sitemap-discover', () => ({
  discoverSitemap: vi.fn(async () => 'https://x.test/sitemap.xml'),
}));
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn(async () => ({ data: { id: 'em1' }, error: null })) },
  })),
}));

import { execa } from 'execa';
import { prepareStep, runGenStep, runFullStep, completeStep, notifyStep, failStep } from './steps';

function fakeProc(stdout: string, exitCode = 0) {
  const promise: any = Promise.resolve({ stdout, stderr: '', exitCode });
  promise.stdout = Readable.from([Buffer.from(stdout)]);
  promise.stderr = Readable.from([]);
  return promise;
}

describe('workflow steps', () => {
  let userId: number;
  let siteId: number;
  let generationId: number;

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
    const [g] = await db
      .insert(generations)
      .values({ siteId, userId, trigger: 'manual', notifyEmail: false })
      .returning();
    generationId = g.id;

    vi.mocked(execa).mockReturnValue(fakeProc('# fixture\n'));
  });

  it('prepareStep flips status to running and resolves sitemap', async () => {
    const out = await prepareStep(generationId);
    expect(out.sitemapUrl).toBe('https://x.test/sitemap.xml');
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.status).toBe('running');
    expect(g.startedAt).not.toBeNull();
    expect(g.resolvedSitemapUrl).toBe('https://x.test/sitemap.xml');
  });

  it('prepareStep is idempotent on resume (does not overwrite startedAt)', async () => {
    await prepareStep(generationId);
    const [first] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    await prepareStep(generationId);
    const [second] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(second.startedAt).toBe(first.startedAt);
  });

  it('runGenStep writes llmsBlobPath', async () => {
    await runGenStep(generationId, 'https://x.test/sitemap.xml');
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.llmsBlobPath).toBe(`gens/${generationId}/llms.txt`);
  });

  it('runFullStep writes llmsFullBlobPath', async () => {
    await runFullStep(generationId, 'https://x.test/sitemap.xml');
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.llmsFullBlobPath).toBe(`gens/${generationId}/llms-full.txt`);
  });

  it('completeStep marks succeeded and updates site.lastGeneratedAt', async () => {
    await completeStep(generationId);
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    const [s] = await getDb().select().from(sites).where(eq(sites.id, siteId));
    expect(g.status).toBe('succeeded');
    expect(g.completedAt).not.toBeNull();
    expect(s.lastGeneratedAt).not.toBeNull();
  });

  it('notifyStep is a no-op when notifyEmail=false', async () => {
    await notifyStep(generationId);
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.notifiedAt).toBeNull();
  });

  it('notifyStep sends email and sets notifiedAt when notifyEmail=true', async () => {
    await getDb()
      .update(generations)
      .set({ notifyEmail: true, status: 'succeeded' })
      .where(eq(generations.id, generationId));
    await notifyStep(generationId);
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.notifiedAt).not.toBeNull();
  });

  it('notifyStep is idempotent when notifiedAt is already set', async () => {
    await getDb()
      .update(generations)
      .set({ notifyEmail: true, notifiedAt: '2026-05-07T00:00:00Z' })
      .where(eq(generations.id, generationId));
    await notifyStep(generationId);
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.notifiedAt).toBe('2026-05-07T00:00:00Z');
  });

  it('failStep marks generation failed with truncated message', async () => {
    await failStep(generationId, 'prepare', new Error('No sitemap found'));
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.status).toBe('failed');
    expect(g.errorMessage).toMatch(/No sitemap found/);
    expect(g.completedAt).not.toBeNull();
  });
});
