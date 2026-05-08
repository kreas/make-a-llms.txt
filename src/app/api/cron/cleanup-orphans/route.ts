import { and, inArray, lt, isNotNull, or } from 'drizzle-orm';
import { del } from '@vercel/blob';
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
        or(isNotNull(generations.llmsBlobPath), isNotNull(generations.llmsFullBlobPath)),
      ),
    );

  let deleted = 0;
  for (const g of orphans) {
    if (g.llmsBlobPath) {
      try {
        await del(`https://blob.vercel-storage.com/${g.llmsBlobPath}`);
        deleted++;
      } catch (err) {
        console.warn('[cron] del failed', g.llmsBlobPath, err);
      }
    }
    if (g.llmsFullBlobPath) {
      try {
        await del(`https://blob.vercel-storage.com/${g.llmsFullBlobPath}`);
        deleted++;
      } catch (err) {
        console.warn('[cron] del failed', g.llmsFullBlobPath, err);
      }
    }
  }

  return Response.json({ deleted });
}
