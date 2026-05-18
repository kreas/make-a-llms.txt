import { ZodError } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { sites, generations } from '@/db/schema';
import { ApiError, apiErrorResponse } from '@/lib/auth-guards';
import { verifyToken } from '@/lib/webhook-token';
import { enqueueGenerationsForSite } from '@/lib/enqueue-generations';
import { parseUid } from '@/lib/uid';

type Ctx = { params: Promise<{ siteId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const auth = req.headers.get('authorization') ?? '';
    const match = auth.match(/^Bearer\s+(\S+)/i);
    if (!match) throw new ApiError(401, 'unauthenticated', 'Missing bearer token');
    const presented = match[1];

    const { siteId: idStr } = await ctx.params;
    let siteUid: string;
    try { siteUid = parseUid(idStr); } catch (e) {
      if (e instanceof ZodError) throw new ApiError(400, 'validation', 'Site id must be a UUID');
      throw e;
    }

    const [site] = await getDb().select().from(sites).where(eq(sites.uid, siteUid));
    if (!site) throw new ApiError(404, 'not_found', 'Site not found');

    if (!verifyToken(presented, site.webhookTokenHash)) {
      throw new ApiError(401, 'unauthenticated', 'Invalid token');
    }

    const inFlight = await getDb().select().from(generations)
      .where(and(eq(generations.siteId, site.id), inArray(generations.status, ['pending', 'running'])));

    const generation = await enqueueGenerationsForSite(site.id, { trigger: 'webhook' });

    const headers: Record<string, string> = {};
    if (inFlight.length > 0) headers['x-dedup'] = 'hit';

    return Response.json({
      generation: {
        id: generation.uid,
        siteId: site.uid,
        status: generation.status,
        trigger: generation.trigger,
        createdAt: generation.createdAt,
      },
    }, { status: 202, headers });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
