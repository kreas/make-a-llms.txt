import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import { parse as tldParse } from 'tldts';
import type { ParsedPage, JsonLdBlock, MetaTag } from './types';
import { extractParagraphs, extractSections } from './text';

function safeJsonParse(s: string): unknown | null {
  try { return JSON.parse(s); } catch { return null; }
}

export function parsePage(url: string, html: string): ParsedPage {
  const { document } = parseHTML(html);

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
  let contentRoot: Element | null = document.body as unknown as Element;
  try {
    const { document: cloneDoc } = parseHTML(html);
    const reader = new Readability(cloneDoc as unknown as Document);
    const r = reader.parse();
    if (r) {
      const textContent = r.textContent ?? '';
      article = {
        title: r.title ?? null,
        textContent: textContent.trim(),
        lengthChars: textContent.length,
      };
      if (r.content) {
        const { document: artDoc } = parseHTML(r.content);
        // Readability emits a bare fragment, so the parsed doc's <body> is empty
        // and the content lives under documentElement (the outer container).
        contentRoot = artDoc.documentElement as unknown as Element;
      }
    }
  } catch {
    article = null;
  }

  const root = contentRoot ?? (document as unknown as Element);
  const paragraphs = extractParagraphs(root);
  const sections = extractSections(root);

  return {
    url,
    rawHtml: html,
    document: document as unknown as Document,
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
    paragraphs,
    sections,
  };
}
