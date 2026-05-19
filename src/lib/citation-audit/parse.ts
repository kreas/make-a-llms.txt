import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { parse as tldParse } from 'tldts';
import type { ParsedPage, JsonLdBlock, MetaTag } from './types';

function safeJsonParse(s: string): unknown | null {
  try { return JSON.parse(s); } catch { return null; }
}

export function parsePage(url: string, html: string): ParsedPage {
  const dom = new JSDOM(html, { url });
  const document = dom.window.document;

  const title = document.querySelector('title')?.textContent?.trim() ?? null;
  const canonical =
    document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;
  const metaDescription =
    document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null;

  const meta: MetaTag[] = Array.from(document.querySelectorAll('meta')).map((m) => ({
    name: m.getAttribute('name') ?? undefined,
    property: m.getAttribute('property') ?? undefined,
    content: m.getAttribute('content') ?? '',
  }));

  const openGraph: Record<string, string> = {};
  for (const m of meta) {
    if (m.property?.startsWith('og:')) openGraph[m.property.slice(3)] = m.content;
  }

  const jsonLd: JsonLdBlock[] = [];
  document.querySelectorAll('script[type="application/ld+json"]').forEach((node) => {
    const parsed = safeJsonParse(node.textContent ?? '');
    if (parsed == null) return;
    if (Array.isArray(parsed)) jsonLd.push(...(parsed as JsonLdBlock[]));
    else jsonLd.push(parsed as JsonLdBlock);
  });

  const headings: ParsedPage['headings'] = [];
  document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
    const level = parseInt(h.tagName[1], 10) as 1 | 2 | 3 | 4 | 5 | 6;
    const text = h.textContent?.trim() ?? '';
    if (text) headings.push({ level, text });
  });

  const pageHost = tldParse(url).domain;
  const links: ParsedPage['links'] = Array.from(document.querySelectorAll('a[href]')).map(
    (a) => {
      const href = a.getAttribute('href') ?? '';
      let absolute = href;
      try { absolute = new URL(href, url).toString(); } catch { /* ignore */ }
      const linkHost = tldParse(absolute).domain;
      return {
        href: absolute,
        text: (a.textContent ?? '').trim(),
        isInternal: !!pageHost && pageHost === linkHost,
      };
    },
  );

  let article: ParsedPage['article'] = null;
  try {
    const clone = new JSDOM(html, { url });
    const reader = new Readability(clone.window.document);
    const r = reader.parse();
    if (r) {
      const textContent = r.textContent ?? '';
      article = {
        title: r.title ?? null,
        textContent: textContent.trim(),
        lengthChars: textContent.length,
      };
    }
  } catch {
    article = null;
  }

  return {
    url,
    rawHtml: html,
    dom,
    document,
    jsonLd,
    microdata: {},
    meta,
    openGraph,
    article,
    title,
    canonical,
    metaDescription,
    headings,
    links,
  };
}
