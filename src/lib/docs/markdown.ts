import { promises as fs } from 'node:fs';
import path from 'node:path';

const MDX_ROOT = path.join(process.cwd(), 'content/docs');

/**
 * Strip a leading YAML frontmatter block (between `---` fences) from raw MDX,
 * then return the remaining markdown body. We do not embed `title` because the
 * MDX bodies already lead with an `# H1` (or a strong-tagged lede).
 */
function stripFrontmatter(raw: string): string {
  if (!raw.startsWith('---')) return raw;
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return raw;
  return raw.slice(end + 4).replace(/^\n+/, '');
}

function parseFrontmatter(raw: string): Record<string, string> {
  if (!raw.startsWith('---')) return {};
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return {};
  const block = raw.slice(3, end).trim();
  const out: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Look up a docs MDX file by slug (use `[]` for the index) and return its raw
 * markdown body with the title prepended as an `# H1`.
 */
export async function loadMdxMarkdown(slug: string[]): Promise<string | null> {
  const relative = slug.length === 0 ? 'index' : slug.join('/');
  const filePath = path.join(MDX_ROOT, `${relative}.mdx`);
  if (!filePath.startsWith(MDX_ROOT)) return null;
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
  const meta = parseFrontmatter(raw);
  const body = stripFrontmatter(raw);
  const title = meta.title?.trim();
  return title ? `# ${title}\n\n${body}` : body;
}

type OpenApiOperation = {
  summary?: string;
  description?: string;
  operationId?: string;
  security?: Array<Record<string, string[]>>;
  parameters?: Array<{
    name?: string;
    in?: string;
    required?: boolean;
    description?: string;
    schema?: unknown;
  }>;
  requestBody?: {
    description?: string;
    required?: boolean;
    content?: Record<string, { schema?: unknown }>;
  };
  responses?: Record<
    string,
    {
      description?: string;
      content?: Record<string, { schema?: unknown }>;
    }
  >;
};

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function renderParameters(params: OpenApiOperation['parameters']): string {
  if (!params || params.length === 0) return '';
  const byLocation = new Map<string, OpenApiOperation['parameters']>();
  for (const p of params) {
    const loc = p.in ?? 'query';
    const bucket = byLocation.get(loc) ?? [];
    bucket.push(p);
    byLocation.set(loc, bucket);
  }
  const out: string[] = [];
  for (const [loc, list] of byLocation) {
    out.push(`### ${loc.charAt(0).toUpperCase() + loc.slice(1)} Parameters\n`);
    for (const p of list!) {
      const required = p.required ? ' (required)' : '';
      const desc = p.description ? ` — ${p.description}` : '';
      out.push(`- \`${p.name}\`${required}${desc}`);
    }
    out.push('');
  }
  return out.join('\n');
}

function renderRequestBody(body: OpenApiOperation['requestBody']): string {
  if (!body) return '';
  const out: string[] = ['## Request Body'];
  if (body.description) out.push('', body.description);
  const json = body.content?.['application/json']?.schema;
  if (json) {
    out.push('', '```json', formatJson(json), '```');
  }
  return out.join('\n');
}

function renderResponses(responses: OpenApiOperation['responses']): string {
  if (!responses) return '';
  const out: string[] = ['## Responses'];
  for (const [status, response] of Object.entries(responses)) {
    out.push('', `### ${status}`);
    if (response.description) out.push('', response.description);
    const json = response.content?.['application/json']?.schema;
    if (json) {
      out.push('', '```json', formatJson(json), '```');
    }
  }
  return out.join('\n');
}

type ResolvedOperation = {
  method: string;
  path: string;
  op: OpenApiOperation;
};

/**
 * Resolve an operation page by its fumadocs slug (the part after `/docs/api/`),
 * then return a markdown rendering of the operation.
 */
export async function loadApiOperationMarkdown(
  slug: string[],
): Promise<string | null> {
  const { getApiSource } = await import('./source');
  const source = await getApiSource();
  const page = source.getPage(slug) as
    | {
        data: {
          getAPIPageProps?: () => {
            operations?: Array<{ method: string; path: string }>;
          };
          getSchema?: () => {
            dereferenced: {
              paths?: Record<string, Record<string, OpenApiOperation>>;
            };
          };
        };
      }
    | undefined;
  if (!page) return null;
  const props = page.data.getAPIPageProps?.();
  const schema = page.data.getSchema?.();
  const first = props?.operations?.[0];
  if (!first || !schema) return null;
  const op = schema.dereferenced.paths?.[first.path]?.[first.method] as
    | OpenApiOperation
    | undefined;
  if (!op) return null;
  return renderOperation({ method: first.method, path: first.path, op });
}

function renderOperation({ method, path, op }: ResolvedOperation): string {
  const title = op.summary ?? op.operationId ?? `${method.toUpperCase()} ${path}`;
  const out: string[] = [`# ${title}`, ''];
  if (op.description) out.push(op.description, '');
  out.push(`\`${method.toUpperCase()} ${path}\``, '');
  if (op.security && op.security.length > 0) {
    const schemes = op.security
      .flatMap((entry) => Object.keys(entry))
      .filter((name, i, arr) => arr.indexOf(name) === i);
    if (schemes.length > 0) {
      out.push('## Authorization', '', `Required: ${schemes.join(', ')}`, '');
    }
  }
  const params = renderParameters(op.parameters);
  if (params) {
    out.push('## Parameters', '', params);
  }
  const body = renderRequestBody(op.requestBody);
  if (body) {
    out.push(body, '');
  }
  const responses = renderResponses(op.responses);
  if (responses) {
    out.push(responses, '');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
