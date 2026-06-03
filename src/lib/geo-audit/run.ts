import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sites, generations, siteGeoAudits } from '@/db/schema';
import type { SiteGeoAudit } from '@/db/schema';
import { get } from '@/lib/blob';
import { analyzeGeoPages } from './analyze';
import { confirmCandidate } from './confirm';
import type { GeoPageInput } from './types';

type ManifestEntry = { url: string; path: string; blobPath: string | null; status: string };

export async function runGeoAudit(opts: { siteId: number }): Promise<SiteGeoAudit> {
  const db = getDb();
  const [site] = await db.select().from(sites).where(eq(sites.id, opts.siteId));
  if (!site) throw new Error(`site ${opts.siteId} not found`);

  const [gen] = await db
    .select()
    .from(generations)
    .where(and(eq(generations.siteId, opts.siteId), eq(generations.status, 'succeeded')))
    .orderBy(desc(generations.createdAt))
    .limit(1);

  if (!gen || !gen.pagesManifestBlobPath) {
    const [row] = await db
      .insert(siteGeoAudits)
      .values({
        siteId: opts.siteId,
        generationId: gen?.id ?? null,
        status: 'failed',
        errorReason: 'no_generation',
        errorMessage: 'Run a generation with crawled pages first.',
        trigger: 'manual',
      })
      .returning();
    return row;
  }

  try {
    const t0 = Date.now();
    const manifestBlob = await get(gen.pagesManifestBlobPath, { access: 'private' });
    const manifest = manifestBlob?.stream
      ? (JSON.parse(await new Response(manifestBlob.stream).text()) as { pages: ManifestEntry[] })
      : { pages: [] };

    const eligible = manifest.pages.filter((p) => p.status === 'ok' && p.blobPath);
    const pages: GeoPageInput[] = [];
    for (const entry of eligible) {
      const blob = await get(entry.blobPath as string, { access: 'private' });
      if (!blob?.stream) continue;
      pages.push({ url: entry.url, path: entry.path, markdown: await new Response(blob.stream).text() });
    }

    if (pages.length === 0) {
      const [row] = await db
        .insert(siteGeoAudits)
        .values({
          siteId: opts.siteId,
          generationId: gen.id,
          status: 'failed',
          errorReason: 'no_pages',
          errorMessage: 'No crawled pages were available to analyze.',
          trigger: 'manual',
        })
        .returning();
      return row;
    }

    const result = await analyzeGeoPages(pages, site.displayName ?? site.name, confirmCandidate);

    const [row] = await db
      .insert(siteGeoAudits)
      .values({
        siteId: opts.siteId,
        generationId: gen.id,
        status: 'succeeded',
        score: result.score,
        tier: result.tier,
        results: JSON.stringify(result),
        llmMsUsed: Date.now() - t0,
        trigger: 'manual',
      })
      .returning();
    return row;
  } catch (err) {
    const [row] = await db
      .insert(siteGeoAudits)
      .values({
        siteId: opts.siteId,
        generationId: gen.id,
        status: 'failed',
        errorReason: 'analysis_failed',
        errorMessage: err instanceof Error ? err.message : String(err),
        trigger: 'manual',
      })
      .returning();
    return row;
  }
}
