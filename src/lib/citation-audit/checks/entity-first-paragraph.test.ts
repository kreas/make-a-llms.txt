import { describe, it, expect } from 'vitest';
import { parsePage } from '../parse';
import { check } from './entity-first-paragraph';

const ok = '<html><body><p>Example Co is a strategy firm.</p></body></html>';
const later = '<html><body><p>We are a strategy firm.</p><p>Example Co was founded in 2020.</p></body></html>';
const none = '<html><body></body></html>';

describe('entity-first-paragraph', () => {
  it('100 when entity in first paragraph', () =>
    expect(check(parsePage('https://x', ok), { entityName: 'Example Co' }).score).toBe(100));
  it('0 when entity only appears in later paragraph', () =>
    expect(check(parsePage('https://x', later), { entityName: 'Example Co' }).score).toBe(0));
  it('0 when no paragraphs', () =>
    expect(check(parsePage('https://x', none), { entityName: 'Example Co' }).score).toBe(0));
});
