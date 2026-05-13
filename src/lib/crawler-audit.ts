import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sites, crawlerAudits, type CrawlerAudit } from '@/db/schema';
import { KNOWN_AI_BOTS, type AuditResults } from './known-ai-bots';
import { parseRobotsTxt, evaluateBot } from './robots-parser';

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 10_000;
const USER_AGENT = 'AI-Ready-Auditor/1.0';

export type FetchRobotsResult =
  | { ok: true; body: string; robotsUrl: string }
  | { ok: false; kind: 'not_found'; robotsUrl: string }
  | { ok: false; kind: 'fetch_error'; error: string; robotsUrl: string }
  | { ok: false; kind: 'too_large'; error: string; robotsUrl: string }
  | { ok: false; kind: 'invalid_url'; error: string; robotsUrl: string };

type FetchRobotsImpl = (rootUrl: string) => Promise<FetchRobotsResult>;

let fetchRobotsImpl: FetchRobotsImpl | null = null;

/** @internal test hook */
export function __setFetchRobotsImpl(impl: FetchRobotsImpl | null): void {
  fetchRobotsImpl = impl;
}

async function defaultFetchRobots(rootUrl: string): Promise<FetchRobotsResult> {
  let robotsUrl: string;
  try {
    robotsUrl = new URL('/robots.txt', rootUrl).toString();
  } catch (err) {
    return {
      ok: false,
      kind: 'invalid_url',
      error: err instanceof Error ? err.message : String(err),
      robotsUrl: rootUrl,
    };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(robotsUrl, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    if (res.status === 404) {
      return { ok: false, kind: 'not_found', robotsUrl };
    }
    if (!res.ok) {
      return {
        ok: false,
        kind: 'fetch_error',
        error: `HTTP ${res.status}`,
        robotsUrl,
      };
    }
    const text = await res.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) {
      return {
        ok: false,
        kind: 'too_large',
        error: `robots.txt exceeds 512KB limit`,
        robotsUrl,
      };
    }
    return { ok: true, body: text, robotsUrl };
  } catch (err) {
    return {
      ok: false,
      kind: 'fetch_error',
      error: err instanceof Error ? err.message : String(err),
      robotsUrl,
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildDefaultResults(): AuditResults {
  return Object.fromEntries(
    KNOWN_AI_BOTS.map((bot) => [bot, { status: 'default' }]),
  ) as AuditResults;
}

export async function runCrawlerAudit(params: {
  siteId: number;
  trigger: 'generation' | 'manual';
  generationId?: number;
}): Promise<CrawlerAudit> {
  const db = getDb();
  const fetcher = fetchRobotsImpl ?? defaultFetchRobots;

  const [site] = await db.select().from(sites).where(eq(sites.id, params.siteId));

  if (!site) {
    // Site row doesn't exist — we can't write a crawler_audits row (FK
    // constraint), so return a non-persisted failed audit. Callers must not
    // assume the returned row has a real id when the site is missing.
    return {
      id: -1,
      siteId: params.siteId,
      status: 'failed',
      robotsUrl: '',
      robotsContent: null,
      results: JSON.stringify(buildDefaultResults()),
      errorMessage: `Site ${params.siteId} not found`,
      fetchedAt: new Date().toISOString(),
      trigger: params.trigger,
      generationId: params.generationId ?? null,
    } as CrawlerAudit;
  }

  const fetched = await fetcher(site.rootUrl);

  if (fetched.ok) {
    const groups = parseRobotsTxt(fetched.body);
    const results = Object.fromEntries(
      KNOWN_AI_BOTS.map((bot) => [bot, evaluateBot(groups, bot)]),
    ) as AuditResults;

    const [row] = await db
      .insert(crawlerAudits)
      .values({
        siteId: site.id,
        status: 'succeeded',
        robotsUrl: fetched.robotsUrl,
        robotsContent: fetched.body,
        results: JSON.stringify(results),
        trigger: params.trigger,
        generationId: params.generationId ?? null,
      })
      .returning();
    return row;
  }

  if (fetched.kind === 'not_found') {
    const [row] = await db
      .insert(crawlerAudits)
      .values({
        siteId: site.id,
        status: 'succeeded',
        robotsUrl: fetched.robotsUrl,
        robotsContent: null,
        results: JSON.stringify(buildDefaultResults()),
        trigger: params.trigger,
        generationId: params.generationId ?? null,
      })
      .returning();
    return row;
  }

  if (fetched.kind === 'invalid_url') {
    const [row] = await db
      .insert(crawlerAudits)
      .values({
        siteId: site.id,
        status: 'failed',
        robotsUrl: fetched.robotsUrl,
        results: JSON.stringify(buildDefaultResults()),
        errorMessage: `Invalid root URL: ${fetched.error}`,
        trigger: params.trigger,
        generationId: params.generationId ?? null,
      })
      .returning();
    return row;
  }

  const [row] = await db
    .insert(crawlerAudits)
    .values({
      siteId: site.id,
      status: 'failed',
      robotsUrl: fetched.robotsUrl,
      results: JSON.stringify(buildDefaultResults()),
      errorMessage: fetched.error,
      trigger: params.trigger,
      generationId: params.generationId ?? null,
    })
    .returning();
  return row;
}
