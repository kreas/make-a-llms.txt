import { PAGE_TYPES, type PageType } from './summary-prompt';

export function extractTitle(markdown: string): string | null {
  const match = markdown.match(/^#\s+(.+?)\s*$/m);
  return match ? match[1].replace(/\s+/g, ' ').trim() : null;
}

export function buildFrontmatter(opts: {
  url: string;
  updated: string;
  title?: string | null;
  summary?: string | null;
  pageType?: PageType | null;
  description?: string | null;
  image?: string | null;
  ogImage?: string | null;
  canonical?: string | null;
}): string {
  const lines: string[] = [];
  if (opts.title) lines.push(`title: ${opts.title}`);
  lines.push(`url: ${opts.url}`);
  lines.push(`summary: ${opts.summary ?? ''}`);
  if (opts.pageType) lines.push(`page_type: ${opts.pageType}`);
  lines.push(`updated: ${opts.updated}`);
  if (opts.description) lines.push(`description: ${opts.description}`);
  if (opts.image) lines.push(`image: ${opts.image}`);
  if (opts.ogImage) lines.push(`ogImage: ${opts.ogImage}`);
  if (opts.canonical) lines.push(`canonical: ${opts.canonical}`);
  return `---\n${lines.join('\n')}\n---\n\n`;
}

export type ParsedFrontmatter = {
  fields: {
    title?: string;
    url: string;
    summary?: string;
    pageType?: PageType;
    updated?: string;
    description?: string;
    image?: string;
    ogImage?: string;
    canonical?: string;
  };
  body: string;
};

function splitFrontmatter(blob: string): { head: string; body: string } {
  if (blob.startsWith('---\n')) {
    // YAML-style: --- on its own line opens, --- on its own line closes.
    const closing = blob.indexOf('\n---', 4);
    if (closing === -1) {
      throw new Error('parseFrontmatter: closing --- delimiter not found');
    }
    const head = blob.slice(4, closing);
    let bodyStart = closing + 4; // past "\n---"
    if (blob[bodyStart] === '\n') bodyStart++; // past the newline after "---"
    if (blob[bodyStart] === '\n') bodyStart++; // past the blank separator line
    return { head, body: blob.slice(bodyStart) };
  }

  // Legacy: key:value lines terminated by a blank line. Kept for old blobs.
  const sepIndex = blob.indexOf('\n\n');
  if (sepIndex === -1) {
    throw new Error('parseFrontmatter: frontmatter terminator not found');
  }
  return { head: blob.slice(0, sepIndex), body: blob.slice(sepIndex + 2) };
}

export function parseFrontmatter(blob: string): ParsedFrontmatter {
  const { head, body } = splitFrontmatter(blob);

  const fields: {
    title?: string;
    url?: string;
    summary?: string;
    pageType?: PageType;
    updated?: string;
    description?: string;
    image?: string;
    ogImage?: string;
    canonical?: string;
  } = {};
  for (const line of head.split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trimStart();
    switch (key) {
      case 'title':
        fields.title = value;
        break;
      case 'url':
        fields.url = value;
        break;
      case 'summary':
        fields.summary = value;
        break;
      case 'page_type':
        if ((PAGE_TYPES as readonly string[]).includes(value)) {
          fields.pageType = value as PageType;
        }
        break;
      case 'updated':
        fields.updated = value;
        break;
      case 'description':
        fields.description = value;
        break;
      case 'image':
        fields.image = value;
        break;
      case 'ogImage':
        fields.ogImage = value;
        break;
      case 'canonical':
        fields.canonical = value;
        break;
    }
  }
  if (fields.url === undefined) {
    throw new Error('parseFrontmatter: required url field not found');
  }
  return { fields: { ...fields, url: fields.url }, body };
}
