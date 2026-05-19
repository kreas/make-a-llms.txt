import { describe, it, expect } from 'vitest';
import { parsePage } from '../parse';
import { check } from './lists-tables';

const ul = '<html><body><ul><li>a</li></ul></body></html>';
const table = '<html><body><table><tr><td>x</td></tr></table></body></html>';
const none = '<html><body><p>plain</p></body></html>';

describe('lists-tables', () => {
  it('100 with ul', () => expect(check(parsePage('https://x', ul), { entityName: 'X' }).score).toBe(100));
  it('100 with table', () => expect(check(parsePage('https://x', table), { entityName: 'X' }).score).toBe(100));
  it('0 with neither', () => expect(check(parsePage('https://x', none), { entityName: 'X' }).score).toBe(0));
});
