import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import archiver from 'archiver';
import { get } from '@vercel/blob';
import {
  ApiError,
  apiErrorResponse,
  assertOwnsGenerationByUid,
  requireUserOrThrow,
} from '@/lib/auth-guards';
import { getDb } from '@/db';
import { sites } from '@/db/schema';
import { eq } from 'drizzle-orm';

type Ctx = { params: Promise<{ id: string }> };

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'site';
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id } = await ctx.params;
    const gen = await assertOwnsGenerationByUid(id, user.id);

    if (!gen.pagesManifestBlobPath) {
      throw new ApiError(404, 'not_found', 'No pages available');
    }

    const manifestBlob = await get(gen.pagesManifestBlobPath, { access: 'private' });
    if (!manifestBlob) throw new ApiError(404, 'not_found', 'Manifest missing');
    const manifestText = await new Response(manifestBlob.stream).text();
    let manifest: { pages: Array<{ path: string | null; filename: string | null; blobPath: string | null; status: string }> };
    try {
      manifest = JSON.parse(manifestText);
    } catch {
      throw new ApiError(404, 'not_found', 'Manifest unreadable');
    }

    const [site] = await getDb().select().from(sites).where(eq(sites.id, gen.siteId));
    const filename = `${slugify(site?.name ?? 'site')}-pages-${gen.id}.zip`;

    const archive = archiver('zip', { zlib: { level: 6 } });

    archive.append(manifestText, { name: 'manifest.json' });
    for (const entry of manifest.pages) {
      if (entry.status !== 'ok' || !entry.blobPath || !entry.path) continue;
      const pageBlob = await get(entry.blobPath, { access: 'private' });
      if (!pageBlob) continue;
      const nodeStream = Readable.fromWeb(pageBlob.stream as unknown as NodeReadableStream);
      archive.append(nodeStream, { name: `${entry.path}.md` });
    }
    void archive.finalize();

    const webStream = Readable.toWeb(archive) as unknown as ReadableStream<Uint8Array>;

    return new Response(webStream, {
      status: 200,
      headers: {
        'content-type': 'application/zip',
        'content-disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
