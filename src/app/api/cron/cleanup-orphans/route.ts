import { and, inArray, lt, isNotNull, or } from 'drizzle-orm';
import { del, list } from '@vercel/blob';
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
        await del(`https://blob.vercel-storage.com/${path}`);
        deleted++;
      } catch (err) {
        console.warn('[cron] del failed', path, err);
      }
    }
    try {
      const { blobs } = await list({ prefix: `gens/${g.id}/pages/` });
      for (const b of blobs) {
        try {
          await del(`https://blob.vercel-storage.com/${b.pathname}`);
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
