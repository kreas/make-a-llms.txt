import { describe, it, expect } from 'vitest';
import { parsePage } from '../parse';
import { check } from './definitions';

const ok = '<html><body><p>Example Co is a strategy firm focused on AI.</p></body></html>';
const fail = '<html><body><p>We help companies do things.</p></body></html>';
const none = '<html><body></body></html>';

describe('definitions', () => {
  it('100 when definition pattern present', () =>
    expect(check(parsePage('https://x', ok), { entityName: 'Example Co' }).score).toBe(100));
  it('0 when no definition', () =>
    expect(check(parsePage('https://x', fail), { entityName: 'Example Co' }).score).toBe(0));
  it('0 when no text', () =>
    expect(check(parsePage('https://x', none), { entityName: 'Example Co' }).score).toBe(0));
});
