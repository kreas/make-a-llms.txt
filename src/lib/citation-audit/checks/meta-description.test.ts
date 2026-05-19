import { describe, it, expect } from 'vitest';
import { parsePage } from '../parse';
import { check } from './meta-description';

const good = (desc: string) => `<html><head><meta name="description" content="${desc}"></head><body></body></html>`;
const optimal = good('x'.repeat(140));
const tooShort = good('Brief.');
const tooLong = good('y'.repeat(200));
const missing = '<html><head></head><body></body></html>';

describe('meta-description', () => {
  it('100 when 120-160 chars', () => expect(check(parsePage('https://x', optimal), { entityName: 'X' }).score).toBe(100));
  it('60 when present but short', () => {
    const r = check(parsePage('https://x', tooShort), { entityName: 'X' });
    expect(r.score).toBe(60);
    expect(r.recommendation).toMatch(/120-160/);
  });
  it('60 when present but long', () => expect(check(parsePage('https://x', tooLong), { entityName: 'X' }).score).toBe(60));
  it('0 when missing', () => {
    const r = check(parsePage('https://x', missing), { entityName: 'X' });
    expect(r.score).toBe(0);
    expect(r.recommendation).toMatch(/Add a meta description/);
  });
});
