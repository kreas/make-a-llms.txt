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
}): string {
  const lines: string[] = [];
  if (opts.title) lines.push(`title: ${opts.title}`);
  lines.push(`url: ${opts.url}`);
  lines.push(`summary: ${opts.summary ?? ''}`);
  if (opts.pageType) lines.push(`page_type: ${opts.pageType}`);
  lines.push(`updated: ${opts.updated}`);
  return lines.join('\n') + '\n\n';
}

export type ParsedFrontmatter = {
  fields: {
    title?: string;
    url: string;
    summary?: string;
    pageType?: PageType;
    updated?: string;
  };
  body: string;
};

export function parseFrontmatter(blob: string): ParsedFrontmatter {
  const sepIndex = blob.indexOf('\n\n');
  if (sepIndex === -1) {
    throw new Error('parseFrontmatter: frontmatter terminator (\\n\\n) not found');
  }
  const head = blob.slice(0, sepIndex);
  const body = blob.slice(sepIndex + 2);

  const fields: {
    title?: string;
    url?: string;
    summary?: string;
    pageType?: PageType;
    updated?: string;
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
    }
  }
  if (fields.url === undefined) {
    throw new Error('parseFrontmatter: required url field not found');
  }
  return { fields: { ...fields, url: fields.url }, body };
}
