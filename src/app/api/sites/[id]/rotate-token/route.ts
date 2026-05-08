import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sites } from '@/db/schema';
import {
  apiErrorResponse,
  ApiError,
  assertOwnsSite,
  requireUserOrThrow,
} from '@/lib/auth-guards';
import { createWebhookToken } from '@/lib/webhook-token';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id } = await ctx.params;
    const siteId = Number(id);
    if (!Number.isInteger(siteId) || siteId <= 0) {
      throw new ApiError(404, 'not_found', 'Site not found');
    }
    await assertOwnsSite(siteId, user.id);

    const tok = createWebhookToken();
    await getDb()
      .update(sites)
      .set({
        webhookTokenHash: tok.hash,
        webhookTokenPrefix: tok.prefix,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(sites.id, siteId));

    return Response.json({ webhookToken: tok.token });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
