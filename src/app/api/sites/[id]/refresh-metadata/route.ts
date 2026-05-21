import { ZodError } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sites } from '@/db/schema';
import {
  apiErrorResponse,
  ApiError,
  assertOwnsSiteByUid,
  requireUserOrThrow,
} from '@/lib/auth-guards';
import { parseUid } from '@/lib/uid';
import { toPublicSite } from '@/lib/services/sites';
import { extractSiteMetadata } from '@/lib/site-metadata/extract';

type Ctx = { params: Promise<{ id: string }> };

async function parseSiteUid(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params;
  try {
    return parseUid(id);
  } catch (e) {
    if (e instanceof ZodError) throw new ApiError(400, 'validation', 'Site id must be a UUID');
    throw e;
  }
}

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const uid = await parseSiteUid(ctx);
    const site = await assertOwnsSiteByUid(uid, user.id);

    const outcome = await extractSiteMetadata(site.rootUrl);
    if (!outcome.ok) {
      throw new ApiError(
        502,
        'extraction_failed',
        `Could not extract metadata (${outcome.reason}): ${outcome.message}`,
      );
    }

    const [updated] = await getDb()
      .update(sites)
      .set({
        displayName: outcome.metadata.name,
        description: outcome.metadata.description,
        faviconUrl: outcome.metadata.faviconUrl,
        metadataFetchedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(sites.id, site.id))
      .returning();

    return Response.json({ site: toPublicSite(updated) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
