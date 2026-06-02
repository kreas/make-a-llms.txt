import type { GeoPageInput } from './types';

const BASE = (acct: string) =>
  `https://api.cloudflare.com/client/v4/accounts/${acct}/browser-rendering/crawl`;

function creds(): { acct: string; token: string } {
  const acct = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!acct || !token) throw new Error('Cloudflare Browser Rendering credentials are not configured.');
  return { acct, token };
}

export async function startCrawl(rootUrl: string, includePatterns: string[]): Promise<string> {
  const { acct, token } = creds();
  const res = await fetch(BASE(acct), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: rootUrl,
      source: 'sitemaps',
      formats: ['markdown'],
      render: false,
      limit: 60,
      crawlPurposes: ['ai-input'],
      options: { includePatterns: Array.from(new Set(includePatterns)) },
    }),
  });
  if (!res.ok) throw new Error(`Cloudflare crawl start failed: ${res.status}`);
  const body = (await res.json()) as { success: boolean; result?: string | { id: string } };
  const id = typeof body.result === 'string' ? body.result : body.result?.id;
  if (!body.success || !id) throw new Error('Cloudflare crawl start returned no job id');
  return id;
}

type CrawlRecord = { url: string; status: string; markdown?: string; metadata?: { url?: string } };

export type CrawlPoll = {
  status: 'running' | 'completed' | 'failed';
  pages: GeoPageInput[];
};

function pathOf(url: string): string {
  try {
    const p = new URL(url).pathname.replace(/^\/|\/$/g, '');
    return p === '' ? 'index' : p;
  } catch {
    return url;
  }
}

export async function pollCrawl(jobId: string): Promise<CrawlPoll> {
  const { acct, token } = creds();
  const res = await fetch(`${BASE(acct)}/${jobId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Cloudflare crawl poll failed: ${res.status}`);
  const body = (await res.json()) as {
    success: boolean;
    result?: { status: string; records?: CrawlRecord[] };
  };
  const raw = body.result?.status ?? 'failed';
  const status: CrawlPoll['status'] =
    raw === 'completed' ? 'completed' : /error|cancel|fail/i.test(raw) ? 'failed' : 'running';
  const pages: GeoPageInput[] = (body.result?.records ?? [])
    .filter((r) => r.status === 'completed' && typeof r.markdown === 'string')
    .map((r) => ({ url: r.metadata?.url ?? r.url, path: pathOf(r.metadata?.url ?? r.url), markdown: r.markdown as string }));
  return { status, pages };
}
