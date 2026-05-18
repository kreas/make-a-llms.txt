import { createDocument } from 'zod-openapi';
import { v1Routes, type V1Route } from './routes';

type ResponseSpec =
  | { description: string; schema: import('zod').ZodType }
  | { description: string; contentType: string }
  | { description: string };

export function buildOpenApiDocument(opts: { publicBaseUrl?: string }) {
  const base = (opts.publicBaseUrl ?? 'http://localhost:3000').replace(/\/$/, '');
  const paths: Record<string, Record<string, unknown>> = {};

  for (const r of Object.values(v1Routes) as V1Route[]) {
    const op: Record<string, unknown> = {
      summary: r.summary,
      tags: r.tags,
      security: [{ bearerAuth: [] }],
      responses: Object.fromEntries(
        Object.entries(r.responses).map(([code, spec]) => {
          const s = spec as ResponseSpec;
          if ('schema' in s && s.schema) {
            return [
              code,
              {
                description: s.description,
                content: { 'application/json': { schema: s.schema } },
              },
            ];
          }
          if ('contentType' in s && s.contentType) {
            return [
              code,
              {
                description: s.description,
                content: { [s.contentType]: {} },
              },
            ];
          }
          return [code, { description: s.description }];
        }),
      ),
    };

    const parameters: unknown[] = [];
    if ('pathParams' in r && r.pathParams) {
      for (const [name, type] of Object.entries(r.pathParams)) {
        parameters.push({
          name,
          in: 'path',
          required: true,
          schema: { type: type === 'integer' ? 'integer' : 'string' },
        });
      }
    }
    if ('queryParams' in r && r.queryParams) {
      for (const [name, spec] of Object.entries(
        r.queryParams as Record<
          string,
          { type: 'integer' | 'string'; required?: boolean; enum?: readonly string[] }
        >,
      )) {
        const schema: Record<string, unknown> = {
          type: spec.type === 'integer' ? 'integer' : 'string',
        };
        if (spec.enum) schema.enum = [...spec.enum];
        parameters.push({
          name,
          in: 'query',
          required: spec.required ?? false,
          schema,
        });
      }
    }
    if (parameters.length > 0) op.parameters = parameters;

    if ('requestBody' in r && r.requestBody) {
      op.requestBody = {
        required: true,
        content: { 'application/json': { schema: r.requestBody } },
      };
    }

    paths[r.path] = { ...(paths[r.path] ?? {}), [r.method]: op };
  }

  return createDocument({
    openapi: '3.1.0',
    info: {
      title: 'AI Ready API',
      version: '1.0.0',
      description: 'Generate llms.txt, llms-full.txt, and per-page markdown.',
    },
    servers: [{ url: `${base}/api/v1` }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'mklt_pat' },
      },
    },
    paths,
  });
}
