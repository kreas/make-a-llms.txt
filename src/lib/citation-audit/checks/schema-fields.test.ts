import { describe, it, expect } from 'vitest';
import { parsePage } from '../parse';
import { check } from './schema-fields';

const completeArticle = `<html><head><script type="application/ld+json">
  {"@type":"Article","headline":"H","datePublished":"2026-01-01","author":{"@type":"Person","name":"X"}}
</script></head></html>`;

const partialArticle = `<html><head><script type="application/ld+json">
  {"@type":"Article","headline":"H"}
</script></head></html>`;

const noSchema = `<html><head></head></html>`;

describe('schema-fields', () => {
  it('100 when all required fields present', () => {
    expect(check(parsePage('https://x', completeArticle), { entityName: 'X' }).score).toBe(100);
  });
  it('partial when some required fields missing', () => {
    const r = check(parsePage('https://x', partialArticle), { entityName: 'X' });
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThan(100);
    expect(r.recommendation).toMatch(/datePublished|author/);
  });
  it('0 when no schema', () => {
    expect(check(parsePage('https://x', noSchema), { entityName: 'X' }).score).toBe(0);
  });
});
