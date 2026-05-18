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
import { createWebhookToken } from '@/lib/webhook-token';
import { parseUid } from '@/lib/uid';

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

    const tok = createWebhookToken();
    await getDb()
      .update(sites)
      .set({
        webhookTokenHash: tok.hash,
        webhookTokenPrefix: tok.prefix,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(sites.id, site.id));

    return Response.json({ webhookToken: tok.token });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
