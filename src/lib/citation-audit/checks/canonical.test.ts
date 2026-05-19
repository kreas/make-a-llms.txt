import { describe, it, expect } from 'vitest';
import { parsePage } from '../parse';
import { check } from './canonical';

const ok = '<html><head><link rel="canonical" href="https://x/p"></head></html>';
const missing = '<html><head></head></html>';

describe('canonical', () => {
  it('100 when present', () => expect(check(parsePage('https://x', ok), { entityName: 'X' }).score).toBe(100));
  it('0 when missing', () => {
    const r = check(parsePage('https://x', missing), { entityName: 'X' });
    expect(r.score).toBe(0);
    expect(r.recommendation).toMatch(/canonical/);
  });
});
