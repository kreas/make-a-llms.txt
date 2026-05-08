import { z } from 'zod';
import { ApiError, apiErrorResponse, requireUserOrThrow } from '@/lib/auth-guards';
import { discoverSitemap } from '@/lib/sitemap-discover';
import { normalizeRootUrl } from '@/lib/validators';

const bodySchema = z.object({
  rootUrl: z.string().url().refine((u) => /^https?:\/\//i.test(u), 'must start with http:// or https://'),
});

export async function POST(req: Request) {
  try {
    await requireUserOrThrow();
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      throw new ApiError(400, 'validation', parsed.error.issues[0]?.message ?? 'Invalid input');
    }

    const root = normalizeRootUrl(parsed.data.rootUrl);
    try {
      const sitemapUrl = await discoverSitemap(root);
      return Response.json({ sitemapUrl });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No sitemap found';
      throw new ApiError(404, 'not_found', msg);
    }
  } catch (err) {
    return apiErrorResponse(err);
  }
}
