import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { get, put } from '@vercel/blob';
import { generateText, Output } from 'ai';
import { getDb } from '@/db';
import { generations, pageQuestionsCache } from '@/db/schema';
import { ApiError, apiErrorResponse, assertOwnsSiteByUid, requireUserOrThrow } from '@/lib/auth-guards';
import { parseUid } from '@/lib/uid';
import { hashBody } from '@/lib/workflow/summarize-page';
import { parseFrontmatter } from '@/lib/workflow/frontmatter';

const MODEL = 'google/gemini-3.1-flash-lite';
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

async function parseSiteUid(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params;
  return parseUid(id);
}

const questionsSchema = z.object({
  questions: z
    .array(z.string().describe('A question a user would ask an AI or search engine in natural user speak to find the results/information on this page'))
    .min(3)
    .max(5),
});

async function getPageBlobInfo(siteId: number, pageUrl: string) {
  const [gen] = await getDb()
    .select()
    .from(generations)
    .where(and(eq(generations.siteId, siteId), eq(generations.status, 'succeeded')))
    .orderBy(desc(generations.createdAt))
    .limit(1);

  if (!gen || !gen.pagesManifestBlobPath) {
    throw new ApiError(404, 'no_generation', 'No successful generation manifest available for this site.');
  }

  const manifestBlob = await get(gen.pagesManifestBlobPath, { access: 'private' });
  if (!manifestBlob) {
    throw new ApiError(404, 'no_manifest', 'Failed to retrieve pages manifest.');
  }

  const manifestText = await new Response(manifestBlob.stream).text();
  const manifest = JSON.parse(manifestText) as { pages?: { url: string; path: string; blobPath: string }[] };
  const page = (manifest.pages ?? []).find((p) => p.url === pageUrl);

  if (!page || !page.blobPath) {
    throw new ApiError(404, 'page_not_found', `Page URL not found in the latest generation manifest.`);
  }

  return page;
}

export async function GET(req: URL | Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const uid = await parseSiteUid(ctx);
    const site = await assertOwnsSiteByUid(uid, user.id);

    const url = new URL(req instanceof Request ? req.url : req);
    const pageUrl = url.searchParams.get('pageUrl');
    if (!pageUrl) {
      throw new ApiError(400, 'validation', 'pageUrl query parameter is required.');
    }

    const page = await getPageBlobInfo(site.id, pageUrl);
    const pageBlob = await get(page.blobPath, { access: 'private' });
    if (!pageBlob) {
      throw new ApiError(404, 'blob_not_found', 'Failed to retrieve page markdown content.');
    }

    const pageText = await new Response(pageBlob.stream).text();
    const { body } = parseFrontmatter(pageText);
    const contentHash = hashBody(body);

    // Check Cache
    const [cached] = await getDb()
      .select()
      .from(pageQuestionsCache)
      .where(
        and(
          eq(pageQuestionsCache.siteId, site.id),
          eq(pageQuestionsCache.urlPath, page.path),
          eq(pageQuestionsCache.contentHash, contentHash),
        ),
      )
      .limit(1);

    if (cached) {
      return Response.json({ questions: JSON.parse(cached.questions) });
    }

    // Generate with AI
    const prompt = `You are a user trying to find information on this documentation page. Analyze the content below and generate 3 to 5 high-quality, specific questions that a user or developer would ask an AI assistant or search engine (like Google) to find the key results or information on this page.

Write the questions in natural "user speak" (e.g., "How do I do X?", "Where can I find Y?", "What's the best way to handle Z?"). Avoid academic, formal, or overly structured phrasing. Make them highly specific to the actual concepts, features, parameters, or instructions on this page.

Page URL: ${pageUrl}
Content:
${body}`;

    const { output } = await generateText({
      model: MODEL,
      output: Output.object({ schema: questionsSchema }),
      prompt,
      maxRetries: 3,
    });

    // Save to Cache
    await getDb()
      .insert(pageQuestionsCache)
      .values({
        siteId: site.id,
        urlPath: page.path,
        url: pageUrl,
        contentHash,
        questions: JSON.stringify(output.questions),
      })
      .onConflictDoUpdate({
        target: [pageQuestionsCache.siteId, pageQuestionsCache.urlPath],
        set: {
          url: pageUrl,
          contentHash,
          questions: JSON.stringify(output.questions),
          updatedAt: sql`(current_timestamp)`,
        },
      });

    return Response.json({ questions: output.questions });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const uid = await parseSiteUid(ctx);
    const site = await assertOwnsSiteByUid(uid, user.id);

    const bodyJson = await req.json().catch(() => ({}));
    const pageUrl = bodyJson.pageUrl;
    if (!pageUrl) {
      throw new ApiError(400, 'validation', 'pageUrl is required in the request body.');
    }

    const page = await getPageBlobInfo(site.id, pageUrl);
    const pageBlob = await get(page.blobPath, { access: 'private' });
    if (!pageBlob) {
      throw new ApiError(404, 'blob_not_found', 'Failed to retrieve page markdown content.');
    }

    const pageText = await new Response(pageBlob.stream).text();
    const { body } = parseFrontmatter(pageText);
    const contentHash = hashBody(body);

    const prompt = `You are a user trying to find information on this documentation page. Analyze the content below and generate 3 to 5 high-quality, specific questions that a user or developer would ask an AI assistant or search engine (like Google) to find the key results or information on this page.

Write the questions in natural "user speak" (e.g., "How do I do X?", "Where can I find Y?", "What's the best way to handle Z?"). Avoid academic, formal, or overly structured phrasing. Make them highly specific to the actual concepts, features, parameters, or instructions on this page.

Page URL: ${pageUrl}
Content:
${body}`;

    const { output } = await generateText({
      model: MODEL,
      output: Output.object({ schema: questionsSchema }),
      prompt,
      maxRetries: 3,
    });

    // Save/Update Cache
    await getDb()
      .insert(pageQuestionsCache)
      .values({
        siteId: site.id,
        urlPath: page.path,
        url: pageUrl,
        contentHash,
        questions: JSON.stringify(output.questions),
      })
      .onConflictDoUpdate({
        target: [pageQuestionsCache.siteId, pageQuestionsCache.urlPath],
        set: {
          url: pageUrl,
          contentHash,
          questions: JSON.stringify(output.questions),
          updatedAt: sql`(current_timestamp)`,
        },
      });

    return Response.json({ questions: output.questions });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
