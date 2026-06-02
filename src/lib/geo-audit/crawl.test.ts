import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startCrawl, pollCrawl } from './crawl';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  process.env.CLOUDFLARE_ACCOUNT_ID = 'acct';
  process.env.CLOUDFLARE_API_TOKEN = 'tok';
});

describe('startCrawl', () => {
  it('POSTs the crawl with includePatterns and returns the job id', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, result: { id: 'job-1' } }) });
    const id = await startCrawl('https://acme.test', ['**/pricing**', '**/']);
    expect(id).toBe('job-1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/browser-rendering/crawl');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.url).toBe('https://acme.test');
    expect(body.formats).toEqual(['markdown']);
    expect(body.options.includePatterns).toContain('**/pricing**');
  });
});

describe('pollCrawl', () => {
  it('returns completed records', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, result: { status: 'completed', records: [
        { url: 'https://acme.test/pricing', status: 'completed', markdown: 'Plans from $29/mo.', metadata: { url: 'https://acme.test/pricing' } },
      ] } }),
    });
    const res = await pollCrawl('job-1');
    expect(res.status).toBe('completed');
    expect(res.pages).toEqual([{ url: 'https://acme.test/pricing', path: 'pricing', markdown: 'Plans from $29/mo.' }]);
  });

  it('reports a still-running job', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true, result: { status: 'running', records: [] } }) });
    const res = await pollCrawl('job-1');
    expect(res.status).toBe('running');
  });
});
