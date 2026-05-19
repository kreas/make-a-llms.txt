import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  fetchMock.mockReset();
  process.env.CLOUDFLARE_ACCOUNT_ID = 'acct-test';
  process.env.CLOUDFLARE_API_TOKEN = 'tok-test';
});

import { fetchRenderedHtml } from './fetch';

describe('fetchRenderedHtml', () => {
  it('extracts html from the JSON envelope Cloudflare actually returns', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      success: true,
      result: '<!doctype html><html><head><meta name="description" content="x"></head></html>',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-browser-ms-used': '1234' },
    }));
    const r = await fetchRenderedHtml('https://example.com/');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.html).toMatch(/<meta name="description"/);
      expect(r.browserMsUsed).toBe(1234);
    }
  });

  it('falls back to raw text when the response is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    }));
    const r = await fetchRenderedHtml('https://example.com/');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.html).toBe('<html></html>');
  });

  it('returns cloudflare failure when JSON envelope reports success=false', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      success: false,
      errors: [{ message: 'render failed' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const r = await fetchRenderedHtml('https://example.com/');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('cloudflare');
      expect(r.message).toMatch(/render failed/);
    }
  });

  it('returns auth failure on 401', async () => {
    fetchMock.mockResolvedValue(new Response('Unauthorized', { status: 401 }));
    const r = await fetchRenderedHtml('https://example.com/');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('auth');
      expect(r.status).toBe(401);
    }
  });

  it('returns cloudflare failure on 5xx', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));
    const r = await fetchRenderedHtml('https://example.com/');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('cloudflare');
  });

  it('returns http failure when target site failed inside cf response', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false, errors: [{ code: 1000, message: 'target site returned 404' }] }), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    }));
    const r = await fetchRenderedHtml('https://example.com/');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('http');
  });

  it('returns timeout on AbortError', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    const r = await fetchRenderedHtml('https://example.com/');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('timeout');
  });
});
