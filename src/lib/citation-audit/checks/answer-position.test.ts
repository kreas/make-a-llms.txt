import { describe, it, expect } from 'vitest';
import { parsePage } from '../parse';
import { check } from './answer-position';

const ok = `<html><body><h1>AI Services</h1><p>Example Co helps mid-market companies adopt AI without the hype. We run discovery workshops, build roadmaps, and partner long-term.</p></body></html>`;
const noEntity = `<html><body><h1>AI Services</h1><p>We help companies adopt AI without the hype. We run workshops and build roadmaps.</p></body></html>`;
const empty = `<html><body><h1>AI</h1></body></html>`;

describe('answer-position', () => {
  it('100 when entity name + summary sentence in first 100 words', () => {
    expect(check(parsePage('https://x', ok), { entityName: 'Example Co' }).score).toBe(100);
  });
  it('partial when summary present but entity missing', () => {
    const r = check(parsePage('https://x', noEntity), { entityName: 'Example Co' });
    expect(r.score).toBe(50);
    expect(r.recommendation).toMatch(/Example Co/);
  });
  it('0 when first 100 words empty/missing', () => {
    expect(check(parsePage('https://x', empty), { entityName: 'Example Co' }).score).toBe(0);
  });
});
