export type CfErrorKind = 'transient' | 'fatal';

export class CfClientError extends Error {
  readonly kind: CfErrorKind;
  constructor(message: string, kind: CfErrorKind) {
    super(message);
    this.name = 'CfClientError';
    this.kind = kind;
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFFS_MS = [1000, 3000];

export type FetchOptions = {
  timeoutMs?: number;
  maxAttempts?: number;
  backoff?: (attempt: number) => number;
};

export async function fetchPageMarkdown(
  url: string,
  opts: FetchOptions = {},
): Promise<{ markdown: string; durationMs: number }> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !token) {
    throw new CfClientError('Cloudflare credentials missing', 'fatal');
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/browser-rendering/markdown`;
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const backoff = opts.backoff ?? ((attempt: number) => DEFAULT_BACKOFFS_MS[attempt - 1] ?? 0);

  let lastErr: CfClientError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const started = Date.now();
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });
      clearTimeout(t);

      if (res.ok) {
        const body = (await res.json()) as { success: boolean; result?: string };
        if (!body.success || typeof body.result !== 'string') {
          throw new CfClientError(`CF returned success=false`, 'transient');
        }
        return { markdown: body.result, durationMs: Date.now() - started };
      }

      const status = res.status;
      if (status === 429 || (status >= 500 && status < 600)) {
        const retryAfter = Number(res.headers.get('retry-after')) || 0;
        lastErr = new CfClientError(`CF ${status}`, 'transient');
        const wait = Math.min(retryAfter * 1000, 10_000) || backoff(attempt);
        if (attempt < maxAttempts && wait > 0) await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw new CfClientError(`CF ${status}`, 'fatal');
    } catch (err) {
      clearTimeout(t);
      if (err instanceof CfClientError) {
        if (err.kind === 'fatal') throw err;
        lastErr = err;
      } else if ((err as Error)?.name === 'AbortError') {
        lastErr = new CfClientError('CF timeout', 'transient');
      } else {
        lastErr = new CfClientError(`CF network: ${(err as Error)?.message ?? String(err)}`, 'transient');
      }
      const wait = backoff(attempt);
      if (attempt < maxAttempts && wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
  }

  throw lastErr ?? new CfClientError('CF unknown', 'transient');
}
