import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sites } from '@/db/schema';
import {
  ApiError,
  apiErrorResponse,
  assertOwnsSiteByUid,
  requireApiTokenOrThrow,
} from '@/lib/auth-guards';
import {
  createGenerationV1Schema,
  listGenerationsV1QuerySchema,
} from '@/lib/openapi/schemas';
import { createWebhookToken } from '@/lib/webhook-token';
import { enqueueGenerationsForSite } from '@/lib/enqueue-generations';
import { listGenerations } from '@/lib/services/generations';

export async function GET(req: Request) {
  try {
    const user = await requireApiTokenOrThrow(req);
    const url = new URL(req.url);
    const parsed = listGenerationsV1QuerySchema.safeParse({
      siteId: url.searchParams.get('siteId') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
    });
    if (!parsed.success) {
      throw new ApiError(400, 'validation', parsed.error.message);
    }
    const generations = await listGenerations(user.id, {
      siteUid: parsed.data.siteId,
      status: parsed.data.status,
      limit: parsed.data.limit,
    });
    return Response.json({ generations });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireApiTokenOrThrow(req);
    const parsed = createGenerationV1Schema.safeParse(await req.json());
    if (!parsed.success) {
      throw new ApiError(400, 'validation', parsed.error.message);
    }
    const body = parsed.data;

    let siteRow: { id: number; uid: string };
    if ('siteId' in body) {
      const s = await assertOwnsSiteByUid(body.siteId, user.id);
      siteRow = { id: s.id, uid: s.uid };
    } else {
      const existing = await getDb().select().from(sites).where(
        and(eq(sites.userId, user.id), eq(sites.rootUrl, body.rootUrl)),
      );
      if (existing.length > 0) {
        siteRow = { id: existing[0].id, uid: existing[0].uid };
      } else {
        const tok = createWebhookToken();
        const [row] = await getDb().insert(sites).values({
          userId: user.id,
          name: body.name,
          rootUrl: body.rootUrl,
          sitemapUrl: body.sitemapUrl ?? null,
          webhookTokenHash: tok.hash,
          webhookTokenPrefix: tok.prefix,
        }).returning();
        siteRow = { id: row.id, uid: row.uid };
      }
    }

    const generation = await enqueueGenerationsForSite(siteRow.id, { trigger: 'manual' });
    const base = new URL(req.url);
    const self = `${base.origin}/api/v1/generations/${generation.uid}`;
    return Response.json({
      generation: {
        id: generation.uid,
        siteId: siteRow.uid,
        status: generation.status,
        trigger: generation.trigger,
        createdAt: generation.createdAt,
        urls: { self, llms: `${self}/llms.txt`, llmsFull: `${self}/llms-full.txt`, pages: `${self}/pages` },
      },
    }, { status: 201 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
