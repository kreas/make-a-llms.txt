import { describe, it, expect } from 'vitest';
import { parsePage } from '../parse';
import { check } from './question-h2s';

const two = '<html><body><h2>What does this do?</h2><h2>How does pricing work</h2></body></html>';
const one = '<html><body><h2>What is AI?</h2><h2>Pricing</h2></body></html>';
const none = '<html><body><h2>Features</h2><h2>Pricing</h2></body></html>';

describe('question-h2s', () => {
  it('100 when >=2 question-style H2s', () => expect(check(parsePage('https://x', two), { entityName: 'X' }).score).toBe(100));
  it('50 when exactly 1', () => expect(check(parsePage('https://x', one), { entityName: 'X' }).score).toBe(50));
  it('0 when none', () => expect(check(parsePage('https://x', none), { entityName: 'X' }).score).toBe(0));
});
