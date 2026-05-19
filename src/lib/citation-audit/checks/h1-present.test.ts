import { describe, it, expect } from 'vitest';
import { parsePage } from '../parse';
import { check } from './h1-present';

const ok = '<html><head><title>T</title></head><body><h1>Hello</h1></body></html>';
const noH1 = '<html><body><h2>Sub</h2></body></html>';
const multipleH1 = '<html><body><h1>One</h1><h1>Two</h1></body></html>';

describe('h1-present', () => {
  it('passes when exactly one H1 exists', () => {
    const r = check(parsePage('https://x', ok), { entityName: 'X' });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(100);
    expect(r.recommendation).toBeNull();
    expect(r.evidence[0]).toMatch(/H1 found: 'Hello'/);
  });
  it('fails when no H1 exists', () => {
    const r = check(parsePage('https://x', noH1), { entityName: 'X' });
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
    expect(r.recommendation).toMatch(/Add a single/);
  });
  it('fails when more than one H1 exists', () => {
    const r = check(parsePage('https://x', multipleH1), { entityName: 'X' });
    expect(r.passed).toBe(false);
    expect(r.recommendation).toMatch(/single H1/);
  });
});
