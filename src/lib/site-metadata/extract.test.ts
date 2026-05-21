import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return { ...actual, generateText: vi.fn() };
});

import { generateText } from 'ai';
import { parseSignals, extractSiteMetadata, buildExtractionPrompt } from './extract';

const HTML_HOPDODDY = `<!doctype html>
<html>
  <head>
    <title>Hopdoddy Burger Bar | Better Burgers</title>
    <meta name="description" content="Hopdoddy serves craft burgers with house-ground beef and hand-cut fries." />
    <meta property="og:title" content="Hopdoddy Burger Bar" />
    <meta property="og:site_name" content="Hopdoddy" />
    <meta property="og:description" content="Better burgers since 2010." />
    <link rel="icon" href="/favicon-32.png" />
    <script type="application/ld+json">
      {"@type":"Restaurant","name":"Hopdoddy Burger Bar","url":"https://hopdoddy.com"}
    </script>
  </head>
  <body>
    <h1>Welcome to Hopdoddy</h1>
    <p>Austin-born better burgers, served with house-ground beef.</p>
  </body>
</html>`;

const HTML_MINIMAL = `<!doctype html><html><head><title>Acme</title></head><body></body></html>`;

describe('parseSignals', () => {
  it('pulls title, og, meta, json-ld org name and favicon', () => {
    const s = parseSignals('https://hopdoddy.com/', HTML_HOPDODDY);
    expect(s.htmlTitle).toBe('Hopdoddy Burger Bar | Better Burgers');
    expect(s.ogTitle).toBe('Hopdoddy Burger Bar');
    expect(s.ogSiteName).toBe('Hopdoddy');
    expect(s.ogDescription).toBe('Better burgers since 2010.');
    expect(s.metaDescription).toContain('Hopdoddy serves craft burgers');
    expect(s.jsonLdOrganizationName).toBe('Hopdoddy Burger Bar');
    expect(s.faviconUrl).toBe('https://hopdoddy.com/favicon-32.png');
    expect(s.bodySnippet).toContain('Austin-born better burgers');
  });

  it('falls back to /favicon.ico when no <link rel="icon">', () => {
    const s = parseSignals('https://acme.test/', HTML_MINIMAL);
    expect(s.faviconUrl).toBe('https://acme.test/favicon.ico');
    expect(s.jsonLdOrganizationName).toBeNull();
  });

  it('also picks Organization name from JSON-LD @graph', () => {
    const html = `<html><head><script type="application/ld+json">{"@graph":[{"@type":"Organization","name":"Globex"}]}</script></head><body></body></html>`;
    const s = parseSignals('https://globex.test/', html);
    expect(s.jsonLdOrganizationName).toBe('Globex');
  });
});

describe('buildExtractionPrompt', () => {
  it('includes all collected signals in the prompt', () => {
    const s = parseSignals('https://hopdoddy.com/', HTML_HOPDODDY);
    const prompt = buildExtractionPrompt(s);
    expect(prompt).toContain('Hopdoddy Burger Bar | Better Burgers');
    expect(prompt).toContain('og:site_name: Hopdoddy');
    expect(prompt).toContain('JSON-LD Organization.name: Hopdoddy Burger Bar');
    expect(prompt).toContain('Root URL: https://hopdoddy.com/');
  });
});

describe('extractSiteMetadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(HTML_HOPDODDY, { status: 200 }),
    );
  });

  it('returns AI-structured name + description and favicon', async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: { name: 'Hopdoddy', description: 'Austin burger chain.' },
    } as Awaited<ReturnType<typeof generateText>>);

    const r = await extractSiteMetadata('https://hopdoddy.com/');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.metadata.name).toBe('Hopdoddy');
    expect(r.metadata.description).toBe('Austin burger chain.');
    expect(r.metadata.faviconUrl).toBe('https://hopdoddy.com/favicon-32.png');
  });

  it('falls back to host name when AI returns empty name', async () => {
    vi.mocked(generateText).mockResolvedValue({
      output: { name: '', description: '' },
    } as Awaited<ReturnType<typeof generateText>>);

    const r = await extractSiteMetadata('https://www.hopdoddy.com/');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.metadata.name).toBe('hopdoddy.com');
    expect(r.metadata.description).toBeNull();
  });

  it('returns fetch error when HTTP fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
    const r = await extractSiteMetadata('https://hopdoddy.com/');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('fetch');
  });

  it('returns ai error when generateText throws', async () => {
    vi.mocked(generateText).mockRejectedValue(new Error('boom'));
    const r = await extractSiteMetadata('https://hopdoddy.com/');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('ai');
  });
});
