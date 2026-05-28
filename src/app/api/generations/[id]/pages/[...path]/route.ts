import { apiErrorResponse, requireUserOrThrow, ApiError, assertOwnsGenerationByUid } from '@/lib/auth-guards';
import { readPageMarkdown } from '@/lib/services/generations';
import { parseGenerationUid } from '@/lib/uid';
import { get, put } from '@vercel/blob';
import { parseFrontmatter, buildFrontmatter } from '@/lib/workflow/frontmatter';
import { fetchPageMarkdown } from '@/lib/markdown-pages/cloudflare';
import { parseHTML } from 'linkedom';
import type { PageType } from '@/lib/workflow/summary-prompt';
import { unstable_noStore as noStore } from 'next/cache';
import { generateText } from 'ai';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

type Ctx = { params: Promise<{ id: string; path: string[] }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    noStore();
    const user = await requireUserOrThrow();
    const { id, path } = await ctx.params;
    const uid = parseGenerationUid(id);
    const stream = await readPageMarkdown(uid, user.id, path.join('/'));
    return new Response(stream, {
      status: 200,
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': 'inline',
        'cache-control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(_req: Request, ctx: Ctx) {
  try {
    noStore();
    const user = await requireUserOrThrow();
    const { id, path } = await ctx.params;
    const uid = parseGenerationUid(id);
    const g = await assertOwnsGenerationByUid(uid, user.id);

    if (!g.pagesManifestBlobPath) {
      throw new ApiError(404, 'not_found', 'No pages for this generation');
    }

    const manifestBlob = await get(g.pagesManifestBlobPath, { access: 'private' });
    if (!manifestBlob || !manifestBlob.stream) {
      throw new ApiError(404, 'not_found', 'Manifest missing');
    }

    const manifestText = await new Response(manifestBlob.stream).text();
    const manifest = JSON.parse(manifestText) as {
      pages: Array<{ url: string; path: string; blobPath: string | null; status: string }>;
    };

    const wanted = path.join('/').replace(/\.md$/, '');
    const entry = manifest.pages.find((p) => p.path === wanted && p.status === 'ok');
    if (!entry || !entry.blobPath) {
      throw new ApiError(404, 'not_found', 'Page not found');
    }

    const pageBlob = await get(entry.blobPath, { access: 'private' });
    if (!pageBlob || !pageBlob.stream) {
      throw new ApiError(404, 'not_found', 'Page blob missing');
    }
    const existingMarkdown = await new Response(pageBlob.stream).text();

    const { searchParams } = new URL(_req.url);
    const action = searchParams.get('action');

    if (action === 'format' || action === 'rewrite') {
      const modelName = 'google/gemini-3.5-flash';
      const userPrompt = `Format the following page markdown to spec:\n\n---\n${existingMarkdown}\n---`;

      // First pass LLM call
      const firstPass = await generateText({
        model: modelName,
        system: PAGE_SYSTEM_PROMPT,
        prompt: userPrompt,
        temperature: 0.3,
        maxTokens: 8000,
      });

      let finalContent = firstPass.text;

      // Run a regex pass over the frontmatter summary and description only
      const FORBIDDEN_FRONTMATTER = /\b(innovative|cutting-edge|seamless|robust|comprehensive|world-class|transformative|premier|dynamic|scalable|leading|leverage|navigate|delve|unlock|harness|empower|elevate|foster|streamline|showcase|delicious|amazing|juicy|crave-worthy)\b/gi;
      const FIRST_PERSON_FRONTMATTER = /\b(we|our|us|you|your)\b/gi;
      const DASHES_FRONTMATTER = /[—–]/g;

      const { fields: firstPassFields } = parseFrontmatterFieldsSafe(finalContent);
      const proseText = `${firstPassFields['summary'] ?? ''}\n${firstPassFields['description'] ?? ''}`;

      const matchedForbidden = proseText.match(FORBIDDEN_FRONTMATTER) ?? [];
      const matchedFirstPerson = proseText.match(FIRST_PERSON_FRONTMATTER) ?? [];
      const matchedDashes = proseText.match(DASHES_FRONTMATTER) ?? [];

      if (matchedForbidden.length > 0 || matchedFirstPerson.length > 0 || matchedDashes.length > 0) {
        const uniqueMatches = Array.from(
          new Set([
            ...matchedForbidden.map((w) => w.toLowerCase()),
            ...matchedFirstPerson.map((w) => w.toLowerCase()),
            ...matchedDashes
          ])
        );

        const nudge = `The previous output's frontmatter contained these forbidden patterns: ${uniqueMatches.join(', ')}. Rewrite the affected fields without those words. Keep the body and other frontmatter fields identical.`;

        const secondPass = await generateText({
          model: modelName,
          system: `${nudge}\n\n${PAGE_SYSTEM_PROMPT}`,
          prompt: `Format the following page markdown to spec:\n\n---\n${finalContent}\n---`,
          temperature: 0.3,
          maxTokens: 8000,
        });

        finalContent = secondPass.text;
      }

      const cleanedContent = cleanCodeFences(finalContent);

      let finalMarkdown = cleanedContent;

      if (cleanedContent !== '[NO_CONTENT]' && cleanedContent !== '[THIN_CONTENT]') {
        const { fields: originalFields } = parseFrontmatterFieldsSafe(existingMarkdown);
        const { fields: llmFields, body: llmBody } = parseFrontmatterFieldsSafe(cleanedContent);

        const finalFields = {
          url: originalFields['url'] || entry.url,
          updated: originalFields['updated'] || new Date().toISOString().slice(0, 10),
          title: originalFields['title'] || undefined,
          pageType: (originalFields['page_type'] || undefined) as PageType | undefined,
          image: originalFields['image'] || undefined,
          ogImage: originalFields['ogImage'] || undefined,
          canonical: originalFields['canonical'] || undefined,
          summary: llmFields['summary'] || originalFields['summary'] || undefined,
          description: llmFields['description'] || originalFields['description'] || undefined,
        };

        finalMarkdown = buildFrontmatter(finalFields) + llmBody.trim() + '\n';
      }

      await put(entry.blobPath, finalMarkdown, {
        access: 'private',
        contentType: 'text/markdown; charset=utf-8',
        addRandomSuffix: false,
        allowOverwrite: true,
      });

      return new Response(finalMarkdown, {
        status: 200,
        headers: {
          'content-type': 'text/markdown; charset=utf-8',
          'content-disposition': 'inline',
          'cache-control': 'no-store, no-cache, must-revalidate',
        },
      });
    }

    // Manual Refresh Flow
    let existingSummary: string | null = null;
    let existingPageType: PageType | null = null;
    let existingTitle: string | null = null;
    try {
      const parsed = parseFrontmatter(existingMarkdown);
      existingSummary = parsed.fields.summary ?? null;
      existingPageType = parsed.fields.pageType ?? null;
      existingTitle = parsed.fields.title ?? null;
    } catch (err) {
      console.warn('Failed to parse frontmatter from existing blob', err);
    }

    // Fetch original HTML to extract metadata
    let ogTitle: string | null = null;
    let ogDescription: string | null = null;
    let ogImage: string | null = null;
    let htmlTitle: string | null = null;
    let metaDescription: string | null = null;
    let htmlCanonical: string | null = null;

    const buster = `_cb=${Date.now()}`;
    const busterUrl = entry.url.includes('?') ? `${entry.url}&${buster}` : `${entry.url}?${buster}`;

    try {
      const USER_AGENT = 'MakeALlmsTxt/1.0 (+https://make-a-llms.txt/bot)';
      const htmlRes = await fetch(busterUrl, {
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,*/*',
          'cache-control': 'no-cache',
          pragma: 'no-cache',
        },
        redirect: 'follow',
        cache: 'no-store',
      });
      if (htmlRes.ok) {
        const html = await htmlRes.text();
        const { document } = parseHTML(html);
        ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() ?? null;
        ogDescription = document.querySelector('meta[property="og:description"]')?.getAttribute('content')?.trim() ?? null;
        ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content')?.trim() ?? null;
        htmlTitle = document.querySelector('title')?.textContent?.trim() ?? null;
        metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() ?? null;
        htmlCanonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href')?.trim() ?? null;
      }
    } catch (err) {
      console.warn('Failed to fetch original page HTML for metadata extraction', err);
    }

    const resolveUrl = (href: string | null, base: string) => {
      if (!href) return null;
      try {
        return new URL(href, base).toString();
      } catch {
        return href;
      }
    };

    const finalOgImage = resolveUrl(ogImage, entry.url);
    const finalCanonical = resolveUrl(htmlCanonical, entry.url) || entry.url;

    // Fetch clean markdown from Cloudflare rendering
    const { markdown } = await fetchPageMarkdown(busterUrl);
    const cleanMarkdown = markdown.replace(new RegExp(`[?&]_cb=\\d+`, 'g'), '');

    const title = ogTitle || htmlTitle || existingTitle || null;
    const description = ogDescription || metaDescription || null;

    const body = buildFrontmatter({
      url: entry.url,
      updated: new Date().toISOString().slice(0, 10),
      title,
      summary: existingSummary,
      pageType: existingPageType,
      description,
      image: finalOgImage,
      ogImage: finalOgImage,
      canonical: finalCanonical,
    }) + cleanMarkdown;

    await put(entry.blobPath, body, {
      access: 'private',
      contentType: 'text/markdown; charset=utf-8',
      addRandomSuffix: false,
      allowOverwrite: true,
    });

    return new Response(body, {
      status: 200,
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': 'inline',
        'cache-control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

function cleanCodeFences(content: string): string {
  let cleaned = content.trim();
  if (cleaned.startsWith('```markdown')) {
    cleaned = cleaned.replace(/^```markdown\r?\n/, '').replace(/\r?\n```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\r?\n/, '').replace(/\r?\n```$/, '');
  }
  return cleaned.trim();
}

function parseFrontmatterFieldsSafe(markdown: string): { fields: Record<string, string>; body: string } {
  const fields: Record<string, string> = {};
  let body = markdown;
  let head = '';

  const trimmed = markdown.trim();
  if (trimmed.startsWith('---')) {
    let closing = trimmed.indexOf('\n---', 3);
    let delimiterLength = 4;
    if (closing === -1) {
      closing = trimmed.indexOf('\r\n---', 3);
      delimiterLength = 5;
    }
    if (closing !== -1) {
      let headStart = 3;
      if (trimmed[headStart] === '\r') headStart++;
      if (trimmed[headStart] === '\n') headStart++;
      head = trimmed.slice(headStart, closing);

      let bodyStart = closing + delimiterLength;
      if (trimmed[bodyStart] === '\r') bodyStart++;
      if (trimmed[bodyStart] === '\n') bodyStart++;
      body = trimmed.slice(bodyStart);
    }
  } else {
    const sepIndex = trimmed.indexOf('\n\n');
    if (sepIndex !== -1) {
      head = trimmed.slice(0, sepIndex);
      body = trimmed.slice(sepIndex + 2);
    } else {
      const crlfSepIndex = trimmed.indexOf('\r\n\r\n');
      if (crlfSepIndex !== -1) {
        head = trimmed.slice(0, crlfSepIndex);
        body = trimmed.slice(crlfSepIndex + 4);
      }
    }
  }

  if (head) {
    for (const line of head.split(/\r?\n/)) {
      const colon = line.indexOf(':');
      if (colon !== -1) {
        const key = line.slice(0, colon).trim();
        const value = line.slice(colon + 1).trim();
        fields[key] = value;
      }
    }
  }

  return { fields, body };
}

function getFrontmatterText(blob: string): string {
  if (blob.startsWith('---\n')) {
    const closing = blob.indexOf('\n---', 4);
    if (closing !== -1) {
      return blob.slice(4, closing);
    }
  }
  const sepIndex = blob.indexOf('\n\n');
  if (sepIndex !== -1) {
    return blob.slice(0, sepIndex);
  }
  return blob;
}

const PAGE_SYSTEM_PROMPT = `You are a page markdown editor. You receive a single page's .md file from a site crawler. The file has YAML frontmatter at the top and an extracted markdown body below that still contains site navigation, footers, ads, and other chrome. Your job is to format the frontmatter to spec and clean the body to its actual content. Return only the formatted file. No code fences, no commentary, no preamble.

## Target structure

---
title: {Page title, often "Brand | Tagline" format}
url: {Canonical URL}
summary: {2 sentences, third person, entity-first, names what the page is and one concrete detail}
page_type: {about | product | blog | location | menu | careers | contact | legal | landing | other}
updated: {YYYY-MM-DD}
description: {Meta description, around 150 characters, no first person, no marketing fluff}
image: {Cover image URL}
ogImage: {Cover image URL}
canonical: {Canonical URL}
---

# {Page H1}

{Clean markdown body: headings, paragraphs, content lists, content links. No nav, no footer, no chrome, no images.}

## Use existing inputs first

Most fields in the rough frontmatter are usable as-is. Touch only what needs fixing.

**Preserve verbatim:**
- \`title\`, \`url\`, \`page_type\`, \`updated\`, \`image\`, \`ogImage\`, \`canonical\`. The crawler already extracted these from the page metadata. Do not regenerate them.

**Evaluate and rewrite if needed:**
- \`summary\`: Keep verbatim if it meets the summary rules below. Rewrite only if it violates them.
- \`description\`: Keep verbatim if it meets the description rules below. If it uses first person ("we", "our", "you"), rewrite to third person while keeping the factual content. If it has marketing adjectives or AI-pattern verbs, swap them out for plain wording. Do not start from scratch when good factual content is already there.

If a field is missing from the rough frontmatter, generate it. Do not invent fields the crawler did not supply.

## Summary rules (the \`summary\` field)

- 2 sentences, 3 maximum. 60-word hard cap.
- Sentence 1 leads with the entity or subject and states what the page is.
- Sentence 2 names a specific differentiator, audience, or concrete detail drawn from the body. Not a generic claim.
- Active voice, present tense, third person.
- No marketing adjectives.
- No AI-pattern verbs.
- No filler openers ("When it comes to", "In today's", "Discover").

## Description rules (the \`description\` field)

- 1 to 3 sentences, around 150 characters.
- Entity-first, declarative, active voice, present tense, third person.
- No first person.
- No marketing adjectives.
- This field gets quoted directly into AI Overviews and meta description displays. Make it useful as a standalone preview.

## Body cleanup rules

The body arrives with site chrome mixed into real content. Strip the chrome, keep the content. Do not rewrite the body's voice. The body is the brand's actual page copy and what gets quoted into AI answers. First-person voice in body prose stays.

**Strip from the body:**
- Skip-to-main-content links and accessibility nav
- Header navigation menus (lists of internal page links to other sections of the site)
- Logo images and links to the homepage
- Cart, checkout, order, sign-in UI elements
- Order, START ORDER, Add to Cart, Buy Now buttons that are UI rather than content
- Social media icons and links
- Footer navigation (Terms, Privacy, Contact, Locations, Careers links grouped at the end)
- Footer copyright lines
- Cookie banners, privacy notices, GDPR popups
- Video player controls ("Watch the Video", "Close Video", play/pause buttons)
- All images in markdown (\`![](...)\` or \`![alt](...)\`). The frontmatter \`image\` field already carries the canonical reference, and AI ingestion does not benefit from inline images in the body.
- Inline tracking pixels and analytics references
- Repeated nav blocks that appear in both header and footer

**Preserve in the body:**
- The page H1 (the actual page heading, distinct from the SEO \`title\` field)
- All H2, H3, H4 headings in the content
- All body paragraphs
- Content lists (product features, ingredient lists, steps in a process, spec rows)
- Inline emphasis (bold, italic) where it conveys intent
- Content links: external links to partner sites, references, citations, or related authoritative sources. Drop only internal navigation-style links.
- Block quotes
- Code blocks and tables

**Clean up in the body:**
- Collapse multi-line headings into single lines. \`## _Raised Right_   \\nSourced Better\` becomes \`## Raised Right, Sourced Better\`.
- Strip purely stylistic emphasis. \`# Delicious Is In The _Details_\` becomes \`# Delicious Is In The Details\` unless the italics carry real meaning.
- Normalize whitespace. No more than one blank line between paragraphs.
- Replace em dashes and en dashes in body prose with commas, periods, or parentheses. This is punctuation normalization, not a voice change.
- Drop trailing whitespace.

## Forbidden in frontmatter prose

These apply to the \`summary\` and \`description\` fields only, not the body:

- Em dashes and en dashes
- Semicolons unless joining two truly independent clauses
- Marketing adjectives: innovative, cutting-edge, seamless, robust, comprehensive, world-class, transformative, premier, dynamic, scalable, leading, holistic, pivotal, vibrant, delicious, amazing, juicy, crave-worthy, fresh-baked, highest quality
- AI-pattern verbs: leverage, navigate (as metaphor), delve, unlock, harness, empower, elevate, foster, streamline, showcase
- Filler openers: "When it comes to", "In today's", "Discover", "Learn", "Explore"
- First-person pronouns ("we", "our", "us", "you")

## Edge cases

- If the page returned a 404, login wall, or returned empty content, return \`[NO_CONTENT]\` instead of frontmatter and body. The downstream pipeline can drop the file.
- If the body contains structured data tables (pricing tiers, spec sheets, feature comparisons, nutrition facts), preserve them as proper markdown tables.
- If the frontmatter \`title\` field is missing, derive it from the page H1.
- If the page H1 is missing but a clear heading exists at the top of the body content, promote that to H1.
- If the rough frontmatter contains fields not in the target structure, drop them.
- If the body has no real content after stripping chrome (a navigation-only page, a landing page that's just a form, a thin product stub), return \`[THIN_CONTENT]\` so the downstream pipeline can flag it for review.

## Output

Return only the formatted markdown file. The first three characters of your response should be \`---\` (the opening frontmatter delimiter), unless the page is empty, in which case return \`[NO_CONTENT]\` or \`[THIN_CONTENT]\` alone.`;
