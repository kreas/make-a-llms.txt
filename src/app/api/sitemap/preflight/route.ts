import { z } from 'zod';
import { ApiError, apiErrorResponse, requireUserOrThrow } from '@/lib/auth-guards';
import { discoverSitemap } from '@/lib/sitemap-discover';
import { checkHomepage } from '@/lib/homepage-check';
import { normalizeRootUrl } from '@/lib/validators';

const bodySchema = z.object({
  rootUrl: z.string().url().refine((u) => /^https?:\/\//i.test(u), 'must start with http:// or https://'),
});

/**
 * Preflight check for starting a new project. Verifies that the homepage is
 * reachable and that a sitemap.xml can be discovered. Always returns 200 with
 * a detailed result (reserving error statuses for auth/validation) so the
 * client can guide the user on exactly what failed.
 */
export async function POST(req: Request) {
  try {
    await requireUserOrThrow();
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      throw new ApiError(400, 'validation', parsed.error.issues[0]?.message ?? 'Invalid input');
    }

    const root = normalizeRootUrl(parsed.data.rootUrl);

    const [homepageReachable, sitemapUrl] = await Promise.all([
      checkHomepage(root),
      discoverSitemap(root).catch(() => null),
    ]);

    return Response.json({
      ok: homepageReachable && sitemapUrl !== null,
      homepageReachable,
      sitemapUrl,
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
