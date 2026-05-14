import { get, put } from '@vercel/blob';
import { generateText, Output } from 'ai';
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
      durationMs: number;
    }
  | {
      url: string;
      path: string;
      status: 'empty';
      pageType: PageType;
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

export async function summarizePage(
  opts: SummarizePageOptions,
): Promise<SummaryOutcome> {
  const { page, siteName, maxInputBytes } = opts;
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
    });

    const trimmed = output.summary.trim();
    const isEmpty = trimmed === '' || trimmed === NO_SUMMARY;
    const finalSummary = isEmpty ? '' : trimmed;

    const newFrontmatter = buildFrontmatter({
      title: fields.title ?? null,
      url: fields.url,
      summary: finalSummary,
      pageType: output.page_type,
      updated: fields.updated ?? '',
    });

    await put(page.blobPath, newFrontmatter + body, {
      access: 'private',
      contentType: 'text/markdown; charset=utf-8',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    if (isEmpty) {
      return {
        url: page.url,
        path: page.path,
        status: 'empty',
        pageType: output.page_type,
        durationMs: Date.now() - started,
      };
    }
    return {
      url: page.url,
      path: page.path,
      status: 'ok',
      pageType: output.page_type,
      summaryBytes: Buffer.byteLength(finalSummary, 'utf8'),
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
