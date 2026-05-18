import { describe, it, expect } from 'vitest';
import { generateTokenSecret, hashTokenSecret, tokenPrefix } from './index';

describe('generateTokenSecret', () => {
  it('returns base64url string of expected length', () => {
    const s = generateTokenSecret(32);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(s.length).toBeGreaterThanOrEqual(40);
  });

  it('returns distinct values on repeated calls', () => {
    expect(generateTokenSecret()).not.toBe(generateTokenSecret());
  });
});

describe('hashTokenSecret', () => {
  it('is deterministic', () => {
    expect(hashTokenSecret('abc')).toBe(hashTokenSecret('abc'));
  });

  it('produces base64url sha256 (43-44 chars)', () => {
    const h = hashTokenSecret('abc');
    expect(h).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(h.length).toBeGreaterThanOrEqual(43);
  });
});

describe('tokenPrefix', () => {
  it('returns the first N characters', () => {
    expect(tokenPrefix('abcdefghij', 5)).toBe('abcde');
  });

  it('defaults to 12 characters', () => {
    expect(tokenPrefix('a'.repeat(40))).toBe('a'.repeat(12));
  });
});
