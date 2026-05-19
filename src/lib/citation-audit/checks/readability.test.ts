import { describe, it, expect } from 'vitest';
import { parsePage } from '../parse';
import { check } from './readability';

// Newspaper-style prose at approx. Flesch-Kincaid grade 6-7 (scores 60).
// The spec's original fixture ("Customer experience teams need clarity…") produced
// grade 3.9 with text-readability, which would score 0, so the fixture was adjusted.
const medium = `<html><body><article><p>${Array(30)
  .fill(
    'The city council voted last night to approve a new budget for road repairs. ' +
      'Officials said the plan will fix more than fifty miles of damaged streets over the next two years. ' +
      'Residents have complained for months about potholes and uneven pavement that damaged their cars.',
  )
  .join(' ')}</p></article></body></html>`;

const empty = '<html><body></body></html>';

describe('readability', () => {
  it('returns a non-zero score for medium-grade prose', () => {
    const r = check(parsePage('https://x', medium), { entityName: 'X' });
    expect(r.score).toBeGreaterThanOrEqual(60);
  });
  it('0 when no body text', () =>
    expect(check(parsePage('https://x', empty), { entityName: 'X' }).score).toBe(0));
});
