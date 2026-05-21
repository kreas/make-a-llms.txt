import { JSDOM } from 'jsdom';
import { generateText, Output } from 'ai';
import { z } from 'zod';

const MODEL = 'google/gemini-3.1-flash-lite';
const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT =
  'MakeALlmsTxt/1.0 (+https://make-a-llms.txt/bot; site-metadata)';

export type SiteMetadata = {
  name: string;
  description: string | null;
  faviconUrl: string | null;
};

export type ExtractionSignals = {
  rootUrl: string;
  htmlTitle: string | null;
  ogTitle: string | null;
  ogSiteName: string | null;
  ogDescription: string | null;
  metaDescription: string | null;
  jsonLdOrganizationName: string | null;
  faviconUrl: string | null;
  bodySnippet: string;
};

export type ExtractOutcome =
  | { ok: true; metadata: SiteMetadata }
  | { ok: false; reason: 'fetch' | 'parse' | 'ai' | 'unknown'; message: string };

const aiSchema = z.object({
  name: z
    .string()
    .describe(
      'The brand name as the business refers to itself. Strip TLDs, marketing taglines, and "Home | …" patterns. Use proper capitalization.',
    ),
  description: z
    .string()
    .describe(
      'A neutral 1-2 sentence description of what the business does. No marketing fluff. If nothing useful is available, return an empty string.',
    ),
});

export async function fetchRootHtml(
  url: string,
): Promise<{ ok: true; html: string } | { ok: false; message: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*' },
      redirect: 'follow',
    });
    if (!res.ok) {
      return { ok: false, message: `HTTP ${res.status}` };
    }
    return { ok: true, html: await res.text() };
  } catch (e) {
    const err = e as Error;
    return { ok: false, message: err.message };
  } finally {
    clearTimeout(timer);
  }
}

function pickJsonLdOrgName(jsonLdBlocks: unknown[]): string | null {
  const looksLikeOrg = (v: Record<string, unknown>): boolean => {
    const t = v['@type'];
    if (typeof t === 'string') {
      return /Organization|LocalBusiness|Corporation|Restaurant|Store|Company/i.test(t);
    }
    if (Array.isArray(t)) {
      return t.some(
        (s) =>
          typeof s === 'string' &&
          /Organization|LocalBusiness|Corporation|Restaurant|Store|Company/i.test(s),
      );
    }
    return false;
  };
  for (const block of jsonLdBlocks) {
    if (!block || typeof block !== 'object') continue;
    const b = block as Record<string, unknown>;
    if (looksLikeOrg(b) && typeof b.name === 'string') return b.name.trim();
    if (Array.isArray(b['@graph'])) {
      for (const g of b['@graph'] as Record<string, unknown>[]) {
        if (g && typeof g === 'object' && looksLikeOrg(g) && typeof g.name === 'string') {
          return g.name.trim();
        }
      }
    }
  }
  return null;
}

function resolveUrl(href: string | null, base: string): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

export function parseSignals(rootUrl: string, html: string): ExtractionSignals {
  const dom = new JSDOM(html, { url: rootUrl });
  const document = dom.window.document;

  const htmlTitle = document.querySelector('title')?.textContent?.trim() ?? null;
  const ogTitle =
    document.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() ?? null;
  const ogSiteName =
    document.querySelector('meta[property="og:site_name"]')?.getAttribute('content')?.trim() ?? null;
  const ogDescription =
    document.querySelector('meta[property="og:description"]')?.getAttribute('content')?.trim() ??
    null;
  const metaDescription =
    document.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() ?? null;

  const jsonLdBlocks: unknown[] = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach((n) => {
    const text = n.textContent ?? '';
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) jsonLdBlocks.push(...parsed);
      else jsonLdBlocks.push(parsed);
    } catch {
      // ignore malformed JSON-LD
    }
  });
  const jsonLdOrganizationName = pickJsonLdOrgName(jsonLdBlocks);

  const iconLink =
    document.querySelector('link[rel="icon"]') ??
    document.querySelector('link[rel="shortcut icon"]') ??
    document.querySelector('link[rel="apple-touch-icon"]');
  const faviconUrl =
    resolveUrl(iconLink?.getAttribute('href') ?? null, rootUrl) ??
    resolveUrl('/favicon.ico', rootUrl);

  const bodyText = document.body?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const bodySnippet = bodyText.slice(0, 1200);

  return {
    rootUrl,
    htmlTitle,
    ogTitle,
    ogSiteName,
    ogDescription,
    metaDescription,
    jsonLdOrganizationName,
    faviconUrl,
    bodySnippet,
  };
}

function fallbackName(rootUrl: string): string {
  try {
    return new URL(rootUrl).host.replace(/^www\./, '');
  } catch {
    return rootUrl;
  }
}

export function buildExtractionPrompt(signals: ExtractionSignals): string {
  return [
    'You are extracting brand identity from a website. Given the signals below, return the canonical brand name and a short, neutral description of what the business does.',
    '',
    'Rules:',
    '- Brand name: how the business refers to itself in marketing — no TLD, no "| Home", no tagline.',
    '- Capitalize the brand name properly (e.g., "Hopdoddy", not "hopdoddy.com" or "HOPDODDY").',
    '- Description: 1-2 sentences, third person, factual. No marketing adjectives. Empty string if nothing useful is available.',
    '- Do not invent details that are not supported by the signals.',
    '',
    `Root URL: ${signals.rootUrl}`,
    `<title>: ${signals.htmlTitle ?? '(none)'}`,
    `og:title: ${signals.ogTitle ?? '(none)'}`,
    `og:site_name: ${signals.ogSiteName ?? '(none)'}`,
    `og:description: ${signals.ogDescription ?? '(none)'}`,
    `meta description: ${signals.metaDescription ?? '(none)'}`,
    `JSON-LD Organization.name: ${signals.jsonLdOrganizationName ?? '(none)'}`,
    `Body snippet: ${signals.bodySnippet || '(empty)'}`,
  ].join('\n');
}

export async function structureWithAi(
  signals: ExtractionSignals,
): Promise<{ name: string; description: string }> {
  const { output } = await generateText({
    model: MODEL,
    output: Output.object({ schema: aiSchema }),
    prompt: buildExtractionPrompt(signals),
    maxRetries: 2,
  });
  return {
    name: output.name.trim(),
    description: output.description.trim(),
  };
}

export async function extractSiteMetadata(rootUrl: string): Promise<ExtractOutcome> {
  const fetched = await fetchRootHtml(rootUrl);
  if (!fetched.ok) {
    return { ok: false, reason: 'fetch', message: fetched.message };
  }
  let signals: ExtractionSignals;
  try {
    signals = parseSignals(rootUrl, fetched.html);
  } catch (e) {
    return { ok: false, reason: 'parse', message: (e as Error).message };
  }
  try {
    const ai = await structureWithAi(signals);
    const name = ai.name || fallbackName(rootUrl);
    const description = ai.description || null;
    return {
      ok: true,
      metadata: { name, description, faviconUrl: signals.faviconUrl },
    };
  } catch (e) {
    return { ok: false, reason: 'ai', message: (e as Error).message };
  }
}
