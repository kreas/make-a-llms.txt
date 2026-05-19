import { describe, it, expect } from 'vitest';
import { parsePage } from '../parse';
import { check } from './heading-hierarchy';

const ok = '<html><body><h1>A</h1><h2>B</h2><h3>C</h3></body></html>';
const oneSkip = '<html><body><h1>A</h1><h3>C</h3></body></html>';
const manySkips = '<html><body><h1>A</h1><h4>D</h4><h2>B</h2><h5>E</h5></body></html>';

describe('heading-hierarchy', () => {
  it('passes when no levels are skipped', () => {
    expect(check(parsePage('https://x', ok), { entityName: 'X' }).score).toBe(100);
  });
  it('partial credit for one skip', () => {
    const r = check(parsePage('https://x', oneSkip), { entityName: 'X' });
    expect(r.passed).toBe(false);
    expect(r.score).toBe(50);
    expect(r.recommendation).toMatch(/skip/);
  });
  it('fails for multiple skips', () => {
    expect(check(parsePage('https://x', manySkips), { entityName: 'X' }).score).toBe(0);
  });
});
