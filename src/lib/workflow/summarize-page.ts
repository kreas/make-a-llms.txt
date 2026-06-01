import { createHash } from 'node:crypto';
import { get, put } from '@/lib/blob';
import { generateText, Output } from 'ai';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db';
import { pageSummaryCache } from '@/db/schema';
import { buildFrontmatter, parseFrontmatter } from './frontmatter';
import {
  buildSummaryPrompt,
  summarySchema,
  type PageType,
} from './summary-prompt';

const MODEL = 'google/gemini-3.1-flash-lite';

export type PageInput = {
  url: string;
  path: string;
  filename: string | null;
  blobPath: string;
};

export type SummaryOutcome =
  | {
      url: string;
      path: string;
      status: 'ok';
      pageType: PageType;
      summaryBytes: number;
      cached: boolean;
      durationMs: number;
    }
  | {
      url: string;
      path: string;
      status: 'empty';
      pageType: PageType;
      cached: boolean;
      durationMs: number;
    }
  | {
      url: string;
      path: string;
      status: 'failed';
      reason: string;
      durationMs: number;
    };

export type SummarizePageOptions = {
  generationId: number;
  siteId: number;
  page: PageInput;
  siteName: string;
  maxInputBytes: number;
};

const NO_SUMMARY = '[NO_SUMMARY]';

async function readBlobText(pathname: string): Promise<string | null> {
  const blob = await get(pathname, { access: 'private' });
  if (!blob) return null;
  return new Response(blob.stream).text();
}

function truncateBody(body: string, maxBytes: number): string {
  const buf = Buffer.from(body, 'utf8');
  if (buf.length <= maxBytes) return body;
  const head = buf.subarray(0, maxBytes).toString('utf8');
  return `${head}\n\n[truncated]\n`;
}

export function hashBody(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

async function loadCachedSummary(
  siteId: number,
  urlPath: string,
  contentHash: string,
): Promise<{ summary: string; pageType: PageType } | null> {
  const rows = await getDb()
    .select({
      summary: pageSummaryCache.summary,
      pageType: pageSummaryCache.pageType,
    })
    .from(pageSummaryCache)
    .where(
      and(
        eq(pageSummaryCache.siteId, siteId),
        eq(pageSummaryCache.urlPath, urlPath),
        eq(pageSummaryCache.contentHash, contentHash),
      ),
    )
    .limit(1);
  if (rows.length === 0) return null;
  return {
    summary: rows[0].summary,
    pageType: rows[0].pageType as PageType,
  };
}

async function upsertCachedSummary(opts: {
  siteId: number;
  urlPath: string;
  url: string;
  contentHash: string;
  summary: string;
  pageType: PageType;
}): Promise<void> {
  await getDb()
    .insert(pageSummaryCache)
    .values({
      siteId: opts.siteId,
      urlPath: opts.urlPath,
      url: opts.url,
      contentHash: opts.contentHash,
      summary: opts.summary,
      pageType: opts.pageType,
    })
    .onConflictDoUpdate({
      target: [pageSummaryCache.siteId, pageSummaryCache.urlPath],
      set: {
        url: opts.url,
        contentHash: opts.contentHash,
        summary: opts.summary,
        pageType: opts.pageType,
        updatedAt: sql`(current_timestamp)`,
      },
    });
}

export async function summarizePage(
  opts: SummarizePageOptions,
): Promise<SummaryOutcome> {
  const { page, siteId, siteName, maxInputBytes } = opts;
  const started = Date.now();

  try {
    const blobText = await readBlobText(page.blobPath);
    if (!blobText) {
      return {
        url: page.url,
        path: page.path,
        status: 'failed',
        reason: 'blob not found',
        durationMs: Date.now() - started,
      };
    }

    const { fields, body } = parseFrontmatter(blobText);
    const contentHash = hashBody(body);

    const cached = await loadCachedSummary(siteId, page.path, contentHash);

    let summary: string;
    let pageType: PageType;
    if (cached) {
      summary = cached.summary;
      pageType = cached.pageType;
    } else {
      const sendBody = truncateBody(body, maxInputBytes);
      const prompt = buildSummaryPrompt({
        url: fields.url,
        title: fields.title ?? '',
        entityName: siteName,
        content: sendBody,
      });
      const { output } = await generateText({
        model: MODEL,
        output: Output.object({ schema: summarySchema }),
        prompt,
        maxRetries: 5,
      });
      summary = output.summary;
      pageType = output.page_type;
    }

    const trimmed = summary.trim();
    const isEmpty = trimmed === '' || trimmed === NO_SUMMARY;
    const finalSummary = isEmpty ? '' : trimmed;

    const newFrontmatter = buildFrontmatter({
      title: fields.title ?? null,
      url: fields.url,
      summary: finalSummary,
      pageType,
      updated: fields.updated ?? '',
      description: fields.description ?? null,
      image: fields.image ?? null,
      ogImage: fields.ogImage ?? null,
      canonical: fields.canonical ?? null,
    });

    // Rewrite with the full original body, not the truncated `sendBody` — we
    // only truncate for the model prompt, never for the stored blob.
    await put(page.blobPath, newFrontmatter + body, {
      access: 'private',
      contentType: 'text/markdown; charset=utf-8',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    if (!cached) {
      await upsertCachedSummary({
        siteId,
        urlPath: page.path,
        url: fields.url,
        contentHash,
        summary: finalSummary,
        pageType,
      });
    }

    if (isEmpty) {
      return {
        url: page.url,
        path: page.path,
        status: 'empty',
        pageType,
        cached: Boolean(cached),
        durationMs: Date.now() - started,
      };
    }
    return {
      url: page.url,
      path: page.path,
      status: 'ok',
      pageType,
      summaryBytes: Buffer.byteLength(finalSummary, 'utf8'),
      cached: Boolean(cached),
      durationMs: Date.now() - started,
    };
  } catch (err) {
    return {
      url: page.url,
      path: page.path,
      status: 'failed',
      reason: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
    };
  }
}
