import { describe, it, expect } from 'vitest';
import { createSiteTaskBodySchema, patchSiteTaskBodySchema } from './site-tasks';

describe('createSiteTaskBodySchema', () => {
  it('accepts a citation-check payload and defaults optional fields', () => {
    const r = createSiteTaskBodySchema.parse({
      sourceType: 'citation-check',
      sourceId: 'schema-type',
      pageUrl: 'https://x.com/about',
      title: 'Schema.org type',
    });
    expect(r.foundText).toBe('');
    expect(r.fixText).toBe('');
  });

  it('defaults pageUrl to empty string for site-level findings', () => {
    const r = createSiteTaskBodySchema.parse({
      sourceType: 'geo-signal',
      sourceId: 'case-studies',
      title: 'Case studies',
    });
    expect(r.pageUrl).toBe('');
  });

  it('rejects unknown sourceType and empty sourceId/title', () => {
    expect(() => createSiteTaskBodySchema.parse({ sourceType: 'nope', sourceId: 'x', title: 'y' })).toThrow();
    expect(() => createSiteTaskBodySchema.parse({ sourceType: 'setup', sourceId: '', title: 'y' })).toThrow();
    expect(() => createSiteTaskBodySchema.parse({ sourceType: 'setup', sourceId: 'x', title: '' })).toThrow();
  });

  it('rejects extra fields (strict)', () => {
    expect(() =>
      createSiteTaskBodySchema.parse({
        sourceType: 'setup', sourceId: 'x', title: 'y', status: 'verified',
      }),
    ).toThrow();
    expect(() => patchSiteTaskBodySchema.parse({ status: 'done', extra: 1 })).toThrow();
  });

  it('rejects oversized fields', () => {
    expect(() =>
      createSiteTaskBodySchema.parse({
        sourceType: 'setup', sourceId: 'x', title: 'y'.repeat(501),
      }),
    ).toThrow();
  });
});

describe('patchSiteTaskBodySchema', () => {
  it('accepts manual statuses only', () => {
    expect(patchSiteTaskBodySchema.parse({ status: 'done' }).status).toBe('done');
    expect(patchSiteTaskBodySchema.parse({ status: 'open' }).status).toBe('open');
    expect(patchSiteTaskBodySchema.parse({ status: 'wont_do' }).status).toBe('wont_do');
  });

  it('rejects verified (system-set only)', () => {
    expect(() => patchSiteTaskBodySchema.parse({ status: 'verified' })).toThrow();
  });
});
