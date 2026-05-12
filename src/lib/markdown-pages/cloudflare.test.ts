import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchPageMarkdown, CfClientError } from './cloudflare';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  process.env.CLOUDFLARE_ACCOUNT_ID = 'acc';
  process.env.CLOUDFLARE_API_TOKEN = 'tok';
});

function ok(markdown: string): Response {
  return new Response(JSON.stringify({ success: true, result: markdown }), { status: 200 });
}

describe('fetchPageMarkdown', () => {
  it('returns markdown on 200 success', async () => {
    fetchMock.mockResolvedValueOnce(ok('# Hello'));
    const out = await fetchPageMarkdown('https://x.test/a');
    expect(out.markdown).toBe('# Hello');
    expect(out.durationMs).toBeGreaterThanOrEqual(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries on 5xx and succeeds on second attempt', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('boom', { status: 502 }))
      .mockResolvedValueOnce(ok('# Hello'));
    const out = await fetchPageMarkdown('https://x.test/a', { backoff: () => 0 });
    expect(out.markdown).toBe('# Hello');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws transient CfClientError after exhausting retries on 429', async () => {
    fetchMock.mockResolvedValue(new Response('rl', { status: 429 }));
    await expect(
      fetchPageMarkdown('https://x.test/a', { backoff: () => 0, maxAttempts: 2 }),
    ).rejects.toMatchObject({ kind: 'transient' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws fatal CfClientError on 401 with no retry', async () => {
    fetchMock.mockResolvedValueOnce(new Response('no', { status: 401 }));
    await expect(
      fetchPageMarkdown('https://x.test/a', { backoff: () => 0 }),
    ).rejects.toMatchObject({ kind: 'fatal' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws fatal when env vars are missing', async () => {
    delete process.env.CLOUDFLARE_API_TOKEN;
    await expect(fetchPageMarkdown('https://x.test/a')).rejects.toMatchObject({ kind: 'fatal' });
  });

  it('treats AbortError (timeout) as transient and retries', async () => {
    // Reject with an AbortError-shaped error on first call, succeed on second.
    const abortErr = Object.assign(new Error('aborted'), { name: 'AbortError' });
    fetchMock
      .mockRejectedValueOnce(abortErr)
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, result: '# ok' }), { status: 200 }));
    const out = await fetchPageMarkdown('https://x.test/a', { backoff: () => 0 });
    expect(out.markdown).toBe('# ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
