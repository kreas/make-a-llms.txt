import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sites } from '@/db/schema';
import { ApiError, apiErrorResponse, requireUserOrThrow } from '@/lib/auth-guards';
import { createSiteSchema } from '@/lib/validators';
import { createWebhookToken } from '@/lib/webhook-token';
import { toPublicSite } from '@/lib/services/sites';

export async function POST(req: Request) {
  try {
    const user = await requireUserOrThrow();
    const body = createSiteSchema.parse(await req.json());

    const existing = await getDb()
      .select()
      .from(sites)
      .where(eq(sites.userId, user.id));
    if (existing.some((s) => s.rootUrl === body.rootUrl)) {
      throw new ApiError(409, 'site_exists', 'You already have a site for this URL');
    }

    const tok = createWebhookToken();
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

    return Response.json({ site: toPublicSite(row), webhookToken: tok.token }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.name === 'ZodError') {
      return apiErrorResponse(new ApiError(400, 'validation', err.message));
    }
    return apiErrorResponse(err);
  }
}

export async function GET() {
  try {
    const user = await requireUserOrThrow();
    const rows = await getDb().select().from(sites).where(eq(sites.userId, user.id));
    return Response.json({ sites: rows.map(toPublicSite) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
