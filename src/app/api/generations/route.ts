import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { generations, sites } from '@/db/schema';
import {
  apiErrorResponse,
  ApiError,
  assertOwnsSite,
  requireUserOrThrow,
} from '@/lib/auth-guards';
import { createGenerationSchema } from '@/lib/validators';
import { createWebhookToken } from '@/lib/webhook-token';
import { enqueueGenerationsForSite } from '@/lib/enqueue-generations';

export async function POST(req: Request) {
  try {
    const user = await requireUserOrThrow();
    const raw = await req.json();
    const parseResult = createGenerationSchema.safeParse(raw);
    if (!parseResult.success) {
      return apiErrorResponse(new ApiError(400, 'validation', parseResult.error.message));
    }
    const body = parseResult.data;

    let siteId: number;
    if ('siteId' in body) {
      await assertOwnsSite(body.siteId, user.id);
      siteId = body.siteId;
    } else {
      // Inline create site
      const tok = createWebhookToken();
      const existing = await getDb()
        .select()
        .from(sites)
        .where(and(eq(sites.userId, user.id), eq(sites.rootUrl, body.rootUrl)));
      if (existing.length > 0) {
        siteId = existing[0].id;
      } else {
        const [row] = await getDb()
          .insert(sites)
          .values({
            userId: user.id,
            name: body.name,
            rootUrl: body.rootUrl,
            sitemapUrl: body.sitemapUrl ?? null,
            webhookTokenHash: tok.hash,
            webhookTokenPrefix: tok.prefix,
          })
          .returning();
        siteId = row.id;
      }
    }

    const generation = await enqueueGenerationsForSite(siteId, {
      trigger: 'manual',
      notifyEmail: body.notifyEmail ?? false,
    });
    return Response.json({ generation }, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function GET(req: Request) {
  try {
    const user = await requireUserOrThrow();
    const url = new URL(req.url);
    const siteIdParam = url.searchParams.get('siteId');

    const where = siteIdParam
      ? and(eq(generations.userId, user.id), eq(generations.siteId, Number(siteIdParam)))
      : eq(generations.userId, user.id);

    const rows = await getDb()
      .select()
      .from(generations)
      .where(where)
      .orderBy(desc(generations.createdAt));

    return Response.json({ generations: rows });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
