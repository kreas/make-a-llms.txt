import { eq } from 'drizzle-orm';
import { Resend } from 'resend';
import { getDb } from '@/db';
import { generations, sites, users } from '@/db/schema';
import { discoverSitemap } from '@/lib/sitemap-discover';
import { runLlmstxt } from '@/lib/llmstxt';

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
      await resend.emails.send({
        from: fromEmail,
        to: u.email,
        subject: 'Your llms.txt is ready',
        html: `<p>Your generation completed.</p><p><a href="${link}">View and download</a></p>`,
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
