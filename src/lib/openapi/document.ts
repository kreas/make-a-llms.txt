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

    if ('pathParams' in r && r.pathParams) {
      op.parameters = Object.entries(r.pathParams).map(([name, type]) => ({
        name,
        in: 'path',
        required: true,
        schema: { type: type === 'integer' ? 'integer' : 'string' },
      }));
    }

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
      title: 'make-a-llms.txt API',
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
