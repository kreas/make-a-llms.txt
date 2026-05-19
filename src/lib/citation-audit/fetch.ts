import type { FetchOutcome } from './types';

const CF_TIMEOUT_MS = 25_000;
const USER_AGENT = 'CitationReadiness/1.0 (+https://make-a-llms.txt/bot)';

export async function fetchRenderedHtml(url: string): Promise<FetchOutcome> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_BROWSER_RENDERING_TOKEN;
  if (!accountId || !token) {
    return { ok: false, reason: 'auth', message: 'Cloudflare Browser Rendering credentials are not configured.' };
  }
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/content`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CF_TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        gotoOptions: { waitUntil: 'networkidle0', timeout: 20_000 },
        rejectResourceTypes: ['image', 'media', 'font'],
        userAgent: USER_AGENT,
      }),
    });
    const fetchMs = Date.now() - t0;
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: 'auth', status: res.status, message: `Cloudflare returned ${res.status}.` };
    }
    if (res.status >= 500) {
      return { ok: false, reason: 'cloudflare', status: res.status, message: `Cloudflare returned ${res.status}.` };
    }
    if (res.status === 400 && res.headers.get('content-type')?.includes('application/json')) {
      const body = await res.json() as { success?: boolean; errors?: { code?: number; message?: string }[] };
      const msg = body.errors?.[0]?.message ?? 'Target site fetch failed.';
      return { ok: false, reason: 'http', status: res.status, message: msg };
    }
    if (!res.ok) {
      return { ok: false, reason: 'unknown', status: res.status, message: `HTTP ${res.status}` };
    }
    const html = await res.text();
    const browserMsUsed = Number(res.headers.get('x-browser-ms-used') ?? 0);
    return { ok: true, html, fetchedAt: new Date().toISOString(), fetchMs, browserMsUsed };
  } catch (e) {
    const err = e as Error & { name?: string };
    if (err.name === 'AbortError') {
      return { ok: false, reason: 'timeout', message: `Cloudflare Browser Rendering timed out after ${CF_TIMEOUT_MS}ms.` };
    }
    return { ok: false, reason: 'unknown', message: err.message };
  } finally {
    clearTimeout(timer);
  }
}
