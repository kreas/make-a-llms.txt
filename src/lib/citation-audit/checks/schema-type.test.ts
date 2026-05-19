import { describe, it, expect } from 'vitest';
import { parsePage } from '../parse';
import { check } from './schema-type';

const article = `<html><head><script type="application/ld+json">{"@type":"Article","headline":"A"}</script></head></html>`;
const justWebPage = `<html><head><script type="application/ld+json">{"@type":"WebPage"}</script></head></html>`;
const none = `<html><head></head></html>`;

describe('schema-type', () => {
  it('100 for an article', () => expect(check(parsePage('https://x', article), { entityName: 'X' }).score).toBe(100));
  it('50 for plain WebPage only', () => {
    const r = check(parsePage('https://x', justWebPage), { entityName: 'X' });
    expect(r.score).toBe(50);
    expect(r.recommendation).toMatch(/specific/);
  });
  it('0 when no JSON-LD', () => expect(check(parsePage('https://x', none), { entityName: 'X' }).score).toBe(0));
});
