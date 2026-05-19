import { describe, it, expect } from 'vitest';
import { runCitationAuditBodySchema, listCitationAuditsQuerySchema } from './citation-audits';

describe('citation audit validators', () => {
  it('accepts a valid POST body', () => {
    expect(runCitationAuditBodySchema.safeParse({ pageUrl: 'https://example.com/x' }).success).toBe(true);
  });
  it('rejects non-URL pageUrl', () => {
    expect(runCitationAuditBodySchema.safeParse({ pageUrl: 'not-a-url' }).success).toBe(false);
  });
  it('rejects extra fields (strict)', () => {
    expect(runCitationAuditBodySchema.safeParse({ pageUrl: 'https://example.com/x', extra: 1 }).success).toBe(false);
  });
  it('accepts optional limit + cursor on history query', () => {
    const r = listCitationAuditsQuerySchema.safeParse({ pageUrl: 'https://x.com/a', limit: '10' });
    expect(r.success).toBe(true);
  });
  it('rejects missing pageUrl on history query', () => {
    expect(listCitationAuditsQuerySchema.safeParse({}).success).toBe(false);
  });
});
