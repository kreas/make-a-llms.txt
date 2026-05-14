export function extractTitle(markdown: string): string | null {
  const match = markdown.match(/^#\s+(.+?)\s*$/m);
  return match ? match[1].replace(/\s+/g, ' ').trim() : null;
}

export function buildFrontmatter(opts: {
  url: string;
  updated: string;
  title?: string | null;
  summary?: string | null;
}): string {
  const lines: string[] = [];
  if (opts.title) lines.push(`title: ${opts.title}`);
  lines.push(`url: ${opts.url}`);
  // summary is left empty until a follow-up LLM step fills it in.
  lines.push(`summary: ${opts.summary ?? ''}`);
  lines.push(`updated: ${opts.updated}`);
  return lines.join('\n') + '\n\n';
}
