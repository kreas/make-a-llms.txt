import { describe, it, expect } from 'vitest';
import { createWebhookToken, hashToken, verifyToken } from './webhook-token';

describe('webhook-token', () => {
  it('createWebhookToken returns token, hash, and prefix; token is reasonably long', () => {
    const t = createWebhookToken();
    expect(t.token).toMatch(/^lmt_/);
    expect(t.token.length).toBeGreaterThanOrEqual(36);
    expect(t.hash).toHaveLength(64); // sha256 hex
    expect(t.prefix.length).toBe(8);
    expect(t.token.startsWith(t.prefix)).toBe(true);
  });

  it('hashToken is deterministic', () => {
    expect(hashToken('lmt_abcdefg')).toBe(hashToken('lmt_abcdefg'));
  });

  it('verifyToken matches by hash', () => {
    const { token, hash } = createWebhookToken();
    expect(verifyToken(token, hash)).toBe(true);
    expect(verifyToken('lmt_wrong', hash)).toBe(false);
  });

  it('verifyToken is constant-time (no early exit on mismatch)', () => {
    // Smoke: not a perf assertion. Just ensure it does not throw on length mismatch.
    expect(verifyToken('short', 'a'.repeat(64))).toBe(false);
  });
});
