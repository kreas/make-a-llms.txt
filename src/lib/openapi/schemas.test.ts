import { describe, it, expect } from 'vitest';
import {
  createGenerationV1Schema,
  generationViewSchema,
  pageManifestSchema,
  errorSchema,
} from './schemas';

describe('createGenerationV1Schema', () => {
  it('accepts the siteId shape', () => {
    const r = createGenerationV1Schema.safeParse({ siteId: 1 });
    expect(r.success).toBe(true);
  });

  it('accepts the inline-site shape', () => {
    const r = createGenerationV1Schema.safeParse({ name: 'S', rootUrl: 'https://s.test' });
    expect(r.success).toBe(true);
  });

  it('rejects empty body', () => {
    const r = createGenerationV1Schema.safeParse({});
    expect(r.success).toBe(false);
  });
});

describe('generationViewSchema', () => {
  it('round-trips a complete view', () => {
    const sample = {
      id: 1,
      status: 'succeeded',
      pages: { status: 'succeeded', count: 5 },
      summaries: { status: 'succeeded', count: 5, emptyCount: 0, failedCount: 0 },
      files: {
        llms: { ready: true },
        llmsFull: { ready: true },
        pages: { ready: true },
      },
      createdAt: '2026-05-14T10:00:00Z',
    };
    expect(generationViewSchema.parse(sample)).toMatchObject({ id: 1 });
  });
});

describe('errorSchema', () => {
  it('shapes errors as { error: { code, message } }', () => {
    expect(errorSchema.parse({ error: { code: 'x', message: 'y' } })).toBeDefined();
  });
});
