import { eq } from 'drizzle-orm';
import { Resend } from 'resend';
import { put, get } from '@vercel/blob';
import { getDb } from '@/db';
import { generations, sites, users } from '@/db/schema';
import { discoverSitemap } from '@/lib/sitemap-discover';
import { runLlmstxt } from '@/lib/llmstxt';
import { fetchPageMarkdown, CfClientError } from '@/lib/markdown-pages/cloudflare';
import { loadSitemapUrls } from '@/lib/markdown-pages/sitemap-urls';
import { mapUrlsToPaths } from '@/lib/markdown-pages/url-to-path';
import { buildManifest, type PageResult } from '@/lib/markdown-pages/manifest';
import type { MappedUrl } from '@/lib/markdown-pages/url-to-path';
import { runWithPool } from '@/lib/markdown-pages/pool';
import { runCrawlerAudit } from '@/lib/crawler-audit';
import { buildFrontmatter, extractTitle } from './frontmatter';
import { summarizePage, type SummaryOutcome } from './summarize-page';

const MAX_OUTPUT_BYTES = Number(process.env.MAX_OUTPUT_BYTES ?? 50 * 1024 * 1024);

function nowIso() {
  return new Date().toISOString();
}

export async function prepareStep(
  generationId: number,
): Promise<{ sitemapUrl: string; rootUrl: string }> {
  'use step';
  const db = getDb();
  const [g] = await db.select().from(generations).where(eq(generations.id, generationId));
  if (!g) throw new Error(`generation ${generationId} not found`);
  const [s] = await db.select().from(sites).where(eq(sites.id, g.siteId));
  if (!s) throw new Error(`site ${g.siteId} not found`);

  const sitemapUrl = s.sitemapUrl ?? (await discoverSitemap(s.rootUrl));

  await db
    .update(generations)
    .set({
      status: 'running',
      startedAt: g.startedAt ?? nowIso(),
      resolvedSitemapUrl: sitemapUrl,
      updatedAt: nowIso(),
    })
    .where(eq(generations.id, generationId));

  return { sitemapUrl, rootUrl: s.rootUrl };
}

export async function runGenStep(generationId: number, sitemapUrl: string): Promise<void> {
  'use step';
  const blobPath = `gens/${generationId}/llms.txt`;
  await runLlmstxt({ subcommand: 'gen', sitemapUrl, blobPath, maxBytes: MAX_OUTPUT_BYTES });
  await getDb()
    .update(generations)
    .set({ llmsBlobPath: blobPath, updatedAt: nowIso() })
    .where(eq(generations.id, generationId));
}

export async function runFullStep(generationId: number, sitemapUrl: string): Promise<void> {
  'use step';
  const blobPath = `gens/${generationId}/llms-full.txt`;
  await runLlmstxt({ subcommand: 'gen-full', sitemapUrl, blobPath, maxBytes: MAX_OUTPUT_BYTES });
  await getDb()
    .update(generations)
    .set({ llmsFullBlobPath: blobPath, updatedAt: nowIso() })
    .where(eq(generations.id, generationId));
}

export async function completeStep(generationId: number): Promise<void> {
  'use step';
  const db = getDb();
  const [g] = await db.select().from(generations).where(eq(generations.id, generationId));
  if (!g) return;
  const ts = nowIso();
  await db
    .update(generations)
    .set({ status: 'succeeded', completedAt: ts, updatedAt: ts })
    .where(eq(generations.id, generationId));
  await db
    .update(sites)
    .set({ lastGeneratedAt: ts, updatedAt: ts })
    .where(eq(sites.id, g.siteId));
}

export async function notifyStep(generationId: number): Promise<void> {
  'use step';
  const db = getDb();
  const [g] = await db.select().from(generations).where(eq(generations.id, generationId));
  if (!g) return;
  if (!g.notifyEmail) return;
  if (g.notifiedAt) return;

  const [u] = await db.select().from(users).where(eq(users.id, g.userId));
  if (!u) return;

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'Auth <noreply@example.com>';

  if (!apiKey) {
    console.log('[notifyStep] RESEND_API_KEY missing, would have emailed', u.email);
  } else {
    const resend = new Resend(apiKey);
    const baseUrl = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000';
    const link = `${baseUrl}/g/${g.id}`;
    try {
      const pagesLine =
        g.pagesStatus === 'succeeded' && g.pagesCount > 0
          ? `<p>We also rendered Markdown for ${g.pagesCount} pages — view them on the generation page.</p>`
          : '';
      await resend.emails.send({
        from: fromEmail,
        to: u.email,
        subject: 'Your llms.txt is ready',
        html: `<p>Your generation completed.</p>${pagesLine}<p><a href="${link}">View and download</a></p>`,
      });
    } catch (err) {
      console.error('[notifyStep] resend failed', err);
      return;
    }
  }

  await db
    .update(generations)
    .set({ notifiedAt: nowIso(), updatedAt: nowIso() })
    .where(eq(generations.id, generationId));
}

export async function failStep(
  generationId: number,
  stepName: string,
  err: unknown,
): Promise<void> {
  'use step';
  const message = err instanceof Error ? err.message : String(err);
  const truncated = `${stepName}: ${message}`.slice(0, 500);
  await getDb()
    .update(generations)
    .set({
      status: 'failed',
      errorMessage: truncated,
      completedAt: nowIso(),
      updatedAt: nowIso(),
    })
    .where(eq(generations.id, generationId));
}

const PAGES_CAP = Number(process.env.PAGES_PER_RUN_CAP ?? 250);
const PAGES_CONCURRENCY = Number(process.env.CLOUDFLARE_BR_CONCURRENCY ?? 5);

const SUMMARY_CONCURRENCY = Number(process.env.AI_SUMMARY_CONCURRENCY ?? 15);
const SUMMARY_MAX_INPUT_BYTES = Number(
  process.env.AI_SUMMARY_MAX_INPUT_BYTES ?? 200_000,
);

// Read at call time so tests can override via process.env in a beforeEach.
function summaryRetryDelayMs(): number {
  return Number(process.env.AI_SUMMARY_RETRY_DELAY_MS ?? 2000);
}

async function readCancelled(generationId: number): Promise<boolean> {
  const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
  return g?.status === 'cancelled';
}

async function markPagesStatus(
  generationId: number,
  fields: Partial<{
    pagesStatus: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'cancelled';
    pagesCount: number;
    pagesManifestBlobPath: string | null;
    pagesErrorMessage: string | null;
  }>,
): Promise<void> {
  await getDb()
    .update(generations)
    .set({ ...fields, updatedAt: nowIso() })
    .where(eq(generations.id, generationId));
}

export async function runPagesStepSafe(
  generationId: number,
  sitemapUrl: string,
  rootUrl: string,
): Promise<void> {
  'use step';
  try {
    await markPagesStatus(generationId, { pagesStatus: 'running' });

    const rawUrls = await loadSitemapUrls(sitemapUrl);
    if (rawUrls.length === 0) {
      return markPagesStatus(generationId, {
        pagesStatus: 'skipped',
        pagesErrorMessage: 'no URLs in sitemap',
      });
    }
    if (rawUrls.length > PAGES_CAP) {
      return markPagesStatus(generationId, {
        pagesStatus: 'skipped',
        pagesErrorMessage: `sitemap has ${rawUrls.length} URLs (cap ${PAGES_CAP})`,
      });
    }
    if (!process.env.CLOUDFLARE_ACCOUNT_ID || !process.env.CLOUDFLARE_API_TOKEN) {
      return markPagesStatus(generationId, {
        pagesStatus: 'failed',
        pagesErrorMessage: 'Cloudflare credentials missing',
      });
    }

    const mapped = mapUrlsToPaths(rawUrls, rootUrl);
    const generatedAt = nowIso();
    const eligible = mapped.filter(
      (m): m is Extract<MappedUrl, { status: 'ok' }> => m.status === 'ok',
    );
    const skipped: PageResult[] = mapped
      .filter((m) => m.status === 'skipped')
      .map((m) => ({
        url: m.url,
        path: null,
        filename: null,
        status: 'skipped' as const,
        blobPath: null,
        reason: 'reason' in m ? m.reason : 'skipped',
        durationMs: 0,
      }));

    const results = await runWithPool(
      eligible,
      async (entry): Promise<PageResult> => {
        try {
          const { markdown, durationMs } = await fetchPageMarkdown(entry.url);
          const body =
            buildFrontmatter({
              url: entry.url,
              updated: generatedAt.slice(0, 10),
              title: extractTitle(markdown),
            }) + markdown;
          const bytes = Buffer.byteLength(body, 'utf8');
          const blobPath = `gens/${generationId}/pages/${entry.path}.md`;
          await put(blobPath, body, {
            access: 'private',
            contentType: 'text/markdown; charset=utf-8',
            addRandomSuffix: false,
            allowOverwrite: true,
          });
          return {
            url: entry.url,
            path: entry.path,
            filename: entry.filename,
            status: 'ok',
            blobPath,
            bytes,
            durationMs,
          };
        } catch (err) {
          const reason =
            err instanceof CfClientError
              ? err.message
              : (err as Error)?.message ?? String(err);
          return {
            url: entry.url,
            path: entry.path,
            filename: entry.filename,
            status: 'failed',
            blobPath: null,
            reason,
            durationMs: 0,
          };
        }
      },
      {
        concurrency: PAGES_CONCURRENCY,
        isCancelled: () => readCancelled(generationId),
      },
    );

    const pageResults: PageResult[] = [
      ...skipped,
      ...(results.filter((r) => !(r instanceof Error)) as PageResult[]),
    ];

    const manifest = buildManifest(
      {
        generationId,
        siteRootUrl: rootUrl,
        sitemapUrl,
        generatedAt,
      },
      pageResults,
    );

    let manifestPath: string | null = null;
    if (pageResults.length > 0) {
      manifestPath = `gens/${generationId}/pages-manifest.json`;
      await put(manifestPath, JSON.stringify(manifest), {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      });
    }

    if (await readCancelled(generationId)) {
      return markPagesStatus(generationId, {
        pagesStatus: 'cancelled',
        pagesCount: manifest.successCount,
        pagesManifestBlobPath: manifestPath,
      });
    }

    return markPagesStatus(generationId, {
      pagesStatus: 'succeeded',
      pagesCount: manifest.successCount,
      pagesManifestBlobPath: manifestPath,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return markPagesStatus(generationId, {
      pagesStatus: 'failed',
      pagesErrorMessage: message.slice(0, 500),
    });
  }
}

export async function runCrawlerAuditStep(generationId: number): Promise<void> {
  'use step';
  try {
    const db = getDb();
    const [g] = await db.select().from(generations).where(eq(generations.id, generationId));
    if (!g) return;
    await runCrawlerAudit({
      siteId: g.siteId,
      trigger: 'generation',
      generationId,
    });
  } catch (err) {
    console.error(
      `[workflow] runCrawlerAuditStep failed id=${generationId}`,
      err,
    );
    // Never re-throw — audit failure must not fail the generation workflow.
  }
}

function hasGatewayAuth(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

async function markSummariesStatus(
  generationId: number,
  fields: Partial<{
    summariesStatus: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'cancelled';
    summariesCount: number;
    summariesEmptyCount: number;
    summariesFailedCount: number;
    summariesManifestBlobPath: string | null;
    summariesErrorMessage: string | null;
  }>,
): Promise<void> {
  await getDb()
    .update(generations)
    .set({ ...fields, updatedAt: nowIso() })
    .where(eq(generations.id, generationId));
}

type PagesManifestPage = {
  url: string;
  path: string;
  filename: string | null;
  status: 'ok' | 'failed' | 'skipped';
  blobPath: string | null;
};

async function loadPagesManifestPages(
  pathname: string,
): Promise<PagesManifestPage[] | null> {
  const blob = await get(pathname, { access: 'private' });
  if (!blob) return null;
  const text = await new Response(blob.stream).text();
  let parsed: { pages?: PagesManifestPage[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  return parsed.pages ?? [];
}

function tallyOutcomes(outcomes: (SummaryOutcome | Error)[]): {
  succeeded: number;
  empty: number;
  failed: number;
  resolved: SummaryOutcome[];
} {
  let succeeded = 0;
  let empty = 0;
  let failed = 0;
  const resolved: SummaryOutcome[] = [];
  for (const o of outcomes) {
    if (o instanceof Error) {
      failed++;
      continue;
    }
    resolved.push(o);
    if (o.status === 'ok') succeeded++;
    else if (o.status === 'empty') empty++;
    else if (o.status === 'failed') failed++;
  }
  return { succeeded, empty, failed, resolved };
}

export async function runSummariesStepSafe(generationId: number): Promise<void> {
  'use step';
  try {
    const db = getDb();
    const [g] = await db.select().from(generations).where(eq(generations.id, generationId));
    if (!g) return;
    if (g.pagesStatus !== 'succeeded' || !g.pagesManifestBlobPath) {
      return markSummariesStatus(generationId, { summariesStatus: 'skipped' });
    }

    const allPages = await loadPagesManifestPages(g.pagesManifestBlobPath);
    if (!allPages) {
      return markSummariesStatus(generationId, { summariesStatus: 'skipped' });
    }
    const eligible = allPages.filter(
      (p): p is PagesManifestPage & { status: 'ok'; blobPath: string } =>
        p.status === 'ok' && p.blobPath !== null,
    );
    if (eligible.length === 0) {
      return markSummariesStatus(generationId, { summariesStatus: 'skipped' });
    }

    if (!hasGatewayAuth()) {
      return markSummariesStatus(generationId, {
        summariesStatus: 'failed',
        summariesErrorMessage: 'AI Gateway credentials missing',
      });
    }

    const [site] = await db.select().from(sites).where(eq(sites.id, g.siteId));
    if (!site) {
      return markSummariesStatus(generationId, {
        summariesStatus: 'failed',
        summariesErrorMessage: 'site not found',
      });
    }

    await markSummariesStatus(generationId, { summariesStatus: 'running' });

    const summarizeOnePage = (page: PagesManifestPage & { blobPath: string }) =>
      summarizePage({
        generationId,
        page: {
          url: page.url,
          path: page.path,
          filename: page.filename,
          blobPath: page.blobPath,
        },
        siteName: site.name,
        maxInputBytes: SUMMARY_MAX_INPUT_BYTES,
      });

    const outcomes = await runWithPool(eligible, summarizeOnePage, {
      concurrency: SUMMARY_CONCURRENCY,
      isCancelled: () => readCancelled(generationId),
    });

    // Second pass: retry pages that failed in the first pass once. Catches
    // bursty rate-limits where AI SDK's per-call maxRetries got exhausted on
    // one wave of contention but a later wave would succeed.
    const retryIndices = outcomes
      .map((o, i) => (o instanceof Error || o.status === 'failed' ? i : -1))
      .filter((i) => i >= 0);
    if (retryIndices.length > 0 && !(await readCancelled(generationId))) {
      const delayMs = summaryRetryDelayMs();
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
      const retryPages = retryIndices.map((i) => eligible[i]);
      const retryOutcomes = await runWithPool(retryPages, summarizeOnePage, {
        concurrency: SUMMARY_CONCURRENCY,
        isCancelled: () => readCancelled(generationId),
      });
      for (let j = 0; j < retryIndices.length; j++) {
        if (j < retryOutcomes.length) {
          outcomes[retryIndices[j]] = retryOutcomes[j];
        }
      }
    }

    const { succeeded, empty, failed, resolved } = tallyOutcomes(outcomes);

    const manifestPath = `gens/${generationId}/summaries-manifest.json`;
    await put(
      manifestPath,
      JSON.stringify({
        version: 1,
        generationId,
        generatedAt: nowIso(),
        okCount: succeeded,
        emptyCount: empty,
        failedCount: failed,
        results: resolved,
      }),
      {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      },
    );

    if (await readCancelled(generationId)) {
      return markSummariesStatus(generationId, {
        summariesStatus: 'cancelled',
        summariesCount: succeeded,
        summariesEmptyCount: empty,
        summariesFailedCount: failed,
        summariesManifestBlobPath: manifestPath,
      });
    }

    return markSummariesStatus(generationId, {
      summariesStatus: 'succeeded',
      summariesCount: succeeded,
      summariesEmptyCount: empty,
      summariesFailedCount: failed,
      summariesManifestBlobPath: manifestPath,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return markSummariesStatus(generationId, {
      summariesStatus: 'failed',
      summariesErrorMessage: message.slice(0, 500),
    });
  }
}
