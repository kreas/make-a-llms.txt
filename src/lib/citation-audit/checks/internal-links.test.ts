import { describe, it, expect } from 'vitest';
import { parsePage } from '../parse';
import { check } from './internal-links';

const many =
  '<html><body><a href="https://x.com/a">A</a><a href="https://x.com/b">B</a><a href="https://x.com/c">C</a></body></html>';
const one =
  '<html><body><a href="https://x.com/a">A</a><a href="https://google.com">G</a></body></html>';
const none = '<html><body><a href="https://google.com">G</a></body></html>';

describe('internal-links', () => {
  it('100 when ≥3 internal', () =>
    expect(check(parsePage('https://x.com/here', many), { entityName: 'X' }).score).toBe(100));
  it('60 when 1-2', () =>
    expect(check(parsePage('https://x.com/here', one), { entityName: 'X' }).score).toBe(60));
  it('0 when none', () =>
    expect(check(parsePage('https://x.com/here', none), { entityName: 'X' }).score).toBe(0));
});
