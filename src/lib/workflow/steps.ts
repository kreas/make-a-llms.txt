import { eq } from 'drizzle-orm';
import { Resend } from 'resend';
import { put } from '@vercel/blob';
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

function frontmatter(url: string, generatedAt: string): string {
  return `---\nsource: ${url}\ngenerated_at: ${generatedAt}\n---\n\n`;
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
          const body = frontmatter(entry.url, generatedAt) + markdown;
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
