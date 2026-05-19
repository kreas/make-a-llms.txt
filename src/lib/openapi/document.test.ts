import { describe, it, expect } from 'vitest';
import { buildOpenApiDocument } from './document';

describe('buildOpenApiDocument', () => {
  const doc = buildOpenApiDocument({ publicBaseUrl: 'https://example.test' });

  it('has version 1.0.0', () => {
    expect(doc.info.version).toBe('1.0.0');
  });

  it('declares bearerAuth at document level', () => {
    expect(doc.components?.securitySchemes?.bearerAuth).toBeDefined();
  });

  it('contains all v1 paths', () => {
    const paths = Object.keys(doc.paths ?? {});
    expect(paths).toEqual(
      expect.arrayContaining([
        '/generations',
        '/generations/{id}',
        '/generations/{id}/llms.txt',
        '/generations/{id}/llms-full.txt',
        '/generations/{id}/pages',
        '/generations/{id}/pages/{path}',
        '/sites/{siteId}/citation-audits/latest',
        '/sites/{siteId}/citation-audits',
        '/sites/{siteId}/citation-audits/{auditId}',
      ]),
    );
  });

  it('every operation declares bearerAuth security', () => {
    for (const path of Object.values(doc.paths ?? {})) {
      for (const op of Object.values(path as Record<string, unknown>)) {
        expect((op as { security: unknown[] }).security).toEqual([{ bearerAuth: [] }]);
      }
    }
  });

  it('uses the supplied servers url', () => {
    expect(doc.servers?.[0].url).toBe('https://example.test/api/v1');
  });
});
