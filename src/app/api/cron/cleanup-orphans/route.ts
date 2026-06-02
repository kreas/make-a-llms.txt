import { and, inArray, lt, isNotNull, or } from 'drizzle-orm';
import { del, list } from '@/lib/blob';
import { getDb } from '@/db';
import { generations } from '@/db/schema';

const ONE_HOUR_MS = 60 * 60 * 1000;

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const cutoff = new Date(Date.now() - ONE_HOUR_MS).toISOString();
  const orphans = await getDb()
    .select()
    .from(generations)
    .where(
      and(
        inArray(generations.status, ['cancelled', 'failed']),
        lt(generations.createdAt, cutoff),
        or(
          isNotNull(generations.llmsBlobPath),
          isNotNull(generations.llmsFullBlobPath),
          isNotNull(generations.pagesManifestBlobPath),
        ),
      ),
    );

  let deleted = 0;
  for (const g of orphans) {
    for (const path of [g.llmsBlobPath, g.llmsFullBlobPath, g.pagesManifestBlobPath]) {
      if (!path) continue;
      try {
        await del(path);
        deleted++;
      } catch (err) {
        console.warn('[cron] del failed', path, err);
      }
    }
    try {
      let pagesPrefix = `gens/${g.id}/pages/`;
      const anyPath = g.pagesManifestBlobPath || g.llmsBlobPath || g.llmsFullBlobPath;
      if (anyPath) {
        const parts = anyPath.split('/');
        if (parts.length >= 3 && parts[0] === 'projects') {
          pagesPrefix = `projects/${parts[1]}/${parts[2]}/pages/`;
        }
      }
      const { blobs } = await list({ prefix: pagesPrefix });
      for (const b of blobs) {
        try {
          await del(b.pathname);
          deleted++;
        } catch (err) {
          console.warn('[cron] del failed', b.pathname, err);
        }
      }
    } catch (err) {
      console.warn('[cron] list failed', g.id, err);
    }
  }

  return Response.json({ deleted });
}
