import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { sites, generations } from '@/db/schema';
import { ApiError, apiErrorResponse } from '@/lib/auth-guards';
import { verifyToken } from '@/lib/webhook-token';
import { enqueueGenerationsForSite } from '@/lib/enqueue-generations';

type Ctx = { params: Promise<{ siteId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const auth = req.headers.get('authorization') ?? '';
    const match = auth.match(/^Bearer\s+(\S+)/i);
    if (!match) throw new ApiError(401, 'unauthenticated', 'Missing bearer token');
    const presented = match[1];

    const { siteId: idStr } = await ctx.params;
    const siteId = Number(idStr);
    if (!Number.isInteger(siteId) || siteId <= 0) {
      throw new ApiError(404, 'not_found', 'Site not found');
    }

    const [site] = await getDb().select().from(sites).where(eq(sites.id, siteId));
    if (!site) throw new ApiError(404, 'not_found', 'Site not found');

    if (!verifyToken(presented, site.webhookTokenHash)) {
      throw new ApiError(401, 'unauthenticated', 'Invalid token');
    }

    // Detect dedupe before insert so we can set the X-Dedup header.
    const inFlight = await getDb()
      .select()
      .from(generations)
      .where(
        and(eq(generations.siteId, siteId), inArray(generations.status, ['pending', 'running'])),
      );

    const generation = await enqueueGenerationsForSite(siteId, { trigger: 'webhook' });

    const headers: Record<string, string> = {};
    if (inFlight.length > 0) headers['x-dedup'] = 'hit';

    return Response.json({ generation }, { status: 202, headers });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
