import { desc, eq } from 'drizzle-orm';
import { get } from '@vercel/blob';
import { getDb } from '@/db';
import { generations } from '@/db/schema';
import { ApiError } from '@/lib/auth-guards';

export async function assertPageUrlInLatestManifest(siteId: number, pageUrl: string): Promise<void> {
  const [gen] = await getDb()
    .select()
    .from(generations)
    .where(eq(generations.siteId, siteId))
    .orderBy(desc(generations.createdAt))
    .limit(1);
  if (!gen || gen.pagesStatus !== 'succeeded' || !gen.pagesManifestBlobPath) {
    throw new ApiError(422, 'no_manifest', 'No successful generation manifest available for this site.');
  }
  const blob = await get(gen.pagesManifestBlobPath, { access: 'private' });
  if (!blob || !blob.stream) {
    throw new ApiError(422, 'no_manifest', 'No successful generation manifest available for this site.');
  }
  const text = await new Response(blob.stream).text();
  const manifest = JSON.parse(text) as { pages?: { url: string }[] };
  const known = (manifest.pages ?? []).some((p) => p.url === pageUrl);
  if (!known) {
    throw new ApiError(422, 'unknown_page', `pageUrl is not in the latest pages manifest.`);
  }
}
