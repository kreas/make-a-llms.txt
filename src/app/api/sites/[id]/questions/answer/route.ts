import { and, eq, sql, desc } from 'drizzle-orm';
import { get } from '@vercel/blob';
import { generateText } from 'ai';
import { getDb } from '@/db';
import { pageQuestionAnswersCache, generations } from '@/db/schema';
import { ApiError, apiErrorResponse, assertOwnsSiteByUid, requireUserOrThrow } from '@/lib/auth-guards';
import { parseUid } from '@/lib/uid';
import { hashBody } from '@/lib/workflow/summarize-page';
import { parseFrontmatter } from '@/lib/workflow/frontmatter';

const SUPPORTED_MODELS = [
  'openai/gpt-5.5',
  'google/gemini-3.5-flash',
  'anthropic/claude-sonnet-4.6',
  'perplexity/sonar',
  'deepseek/deepseek-v4-flash',
];

type Ctx = { params: Promise<{ id: string }> };

async function parseSiteUid(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params;
  return parseUid(id);
}

async function getPageBlobInfo(siteId: number, pageUrl: string) {
  const [gen] = await getDb()
    .select()
    .from(generations)
    .where(and(eq(generations.siteId, siteId), eq(generations.pagesStatus, 'succeeded')))
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
    const question = url.searchParams.get('question');
    const model = url.searchParams.get('model');

    if (!pageUrl || !question || !model) {
      throw new ApiError(400, 'validation', 'pageUrl, question, and model parameters are required.');
    }

    if (!SUPPORTED_MODELS.includes(model)) {
      throw new ApiError(400, 'validation', `Model "${model}" is not supported.`);
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
      .from(pageQuestionAnswersCache)
      .where(
        and(
          eq(pageQuestionAnswersCache.siteId, site.id),
          eq(pageQuestionAnswersCache.urlPath, page.path),
          eq(pageQuestionAnswersCache.question, question),
          eq(pageQuestionAnswersCache.model, model),
          eq(pageQuestionAnswersCache.contentHash, contentHash),
        ),
      )
      .limit(1);

    if (cached) {
      return Response.json({
        answer: cached.answer,
        citations: cached.citations ? JSON.parse(cached.citations) : undefined,
      });
    }

    // Call AI Gateway
    const prompt = `You are an AI assistant answering a user's question about the following documentation page. Answer the question accurately using ONLY the information provided in the page content. If the answer cannot be found in the content, say "I cannot find the answer to this question in the provided documentation." Do not extrapolate or assume. Keep the answer direct and helpful.

Page Content:
${body}

Question: ${question}
Answer:`;

    const { text, sources } = await generateText({
      model,
      prompt,
      maxRetries: 3,
    });

    // Save to Cache
    await getDb()
      .insert(pageQuestionAnswersCache)
      .values({
        siteId: site.id,
        urlPath: page.path,
        question,
        model,
        contentHash,
        answer: text,
        citations: sources ? JSON.stringify(sources) : null,
      })
      .onConflictDoUpdate({
        target: [
          pageQuestionAnswersCache.siteId,
          pageQuestionAnswersCache.urlPath,
          pageQuestionAnswersCache.question,
          pageQuestionAnswersCache.model,
        ],
        set: {
          contentHash,
          answer: text,
          citations: sources ? JSON.stringify(sources) : null,
          updatedAt: sql`(current_timestamp)`,
        },
      });

    return Response.json({ answer: text, citations: sources });
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
    const { pageUrl, question, model } = bodyJson;

    if (!pageUrl || !question || !model) {
      throw new ApiError(400, 'validation', 'pageUrl, question, and model are required in the request body.');
    }

    if (!SUPPORTED_MODELS.includes(model)) {
      throw new ApiError(400, 'validation', `Model "${model}" is not supported.`);
    }

    const page = await getPageBlobInfo(site.id, pageUrl);
    const pageBlob = await get(page.blobPath, { access: 'private' });
    if (!pageBlob) {
      throw new ApiError(404, 'blob_not_found', 'Failed to retrieve page markdown content.');
    }

    const pageText = await new Response(pageBlob.stream).text();
    const { body } = parseFrontmatter(pageText);
    const contentHash = hashBody(body);

    const prompt = `You are an AI assistant answering a user's question about the following documentation page. Answer the question accurately using ONLY the information provided in the page content. If the answer cannot be found in the content, say "I cannot find the answer to this question in the provided documentation." Do not extrapolate or assume. Keep the answer direct and helpful.

Page Content:
${body}

Question: ${question}
Answer:`;

    const { text, sources } = await generateText({
      model,
      prompt,
      maxRetries: 3,
    });

    // Save/Update Cache
    await getDb()
      .insert(pageQuestionAnswersCache)
      .values({
        siteId: site.id,
        urlPath: page.path,
        question,
        model,
        contentHash,
        answer: text,
        citations: sources ? JSON.stringify(sources) : null,
      })
      .onConflictDoUpdate({
        target: [
          pageQuestionAnswersCache.siteId,
          pageQuestionAnswersCache.urlPath,
          pageQuestionAnswersCache.question,
          pageQuestionAnswersCache.model,
        ],
        set: {
          contentHash,
          answer: text,
          citations: sources ? JSON.stringify(sources) : null,
          updatedAt: sql`(current_timestamp)`,
        },
      });

    return Response.json({ answer: text, citations: sources });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
