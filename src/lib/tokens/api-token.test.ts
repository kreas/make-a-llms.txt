import { describe, it, expect } from 'vitest';
import { createApiToken, verifyApiToken, API_TOKEN_PREFIX } from './api-token';

describe('createApiToken', () => {
  it('returns token, hash, and prefix', () => {
    const t = createApiToken();
    expect(t.token.startsWith(API_TOKEN_PREFIX)).toBe(true);
    expect(t.token.length).toBeGreaterThanOrEqual(API_TOKEN_PREFIX.length + 40);
    expect(t.hash.length).toBeGreaterThanOrEqual(43);
    expect(t.prefix.length).toBe(12);
    expect(t.token.startsWith(t.prefix)).toBe(true);
  });

  it('returns distinct tokens on repeated calls', () => {
    expect(createApiToken().token).not.toBe(createApiToken().token);
  });
});

describe('verifyApiToken', () => {
  it('returns true for matching hash', () => {
    const { token, hash } = createApiToken();
    expect(verifyApiToken(token, hash)).toBe(true);
  });

  it('returns false for non-matching hash', () => {
    const { hash } = createApiToken();
    expect(verifyApiToken('mklt_pat_wrong', hash)).toBe(false);
  });

  it('returns false for tokens missing the prefix', () => {
    const { hash } = createApiToken();
    expect(verifyApiToken('not-a-token', hash)).toBe(false);
  });
});
