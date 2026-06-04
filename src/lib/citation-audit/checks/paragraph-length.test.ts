import { describe, it, expect } from 'vitest';
import { check } from './paragraph-length';
import type { ParsedPage } from '../types';

const word = 'lorem';
function para(n: number): string {
  return Array(n).fill(word).join(' ');
}
function pageWith(paragraphs: string[]): ParsedPage {
  return { paragraphs, sections: [] } as unknown as ParsedPage;
}

describe('paragraph-length', () => {
  it('passes with full score when all paragraphs are short', () => {
    const r = check(pageWith([para(40), para(80), para(120)]), { entityName: 'X' });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(100);
  });

  it('passes/100 with no paragraphs', () => {
    const r = check(pageWith([]), { entityName: 'X' });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(100);
    expect(r.evidence[0]).toMatch(/no prose paragraphs/i);
  });

  it('gives graduated credit when a quarter are walls', () => {
    // 1 of 4 over 130 → longFraction 0.25 → 100 - 50 = 50; passed=false (>15%)
    const r = check(pageWith([para(200), para(40), para(40), para(40)]), { entityName: 'X' });
    expect(r.passed).toBe(false);
    expect(r.score).toBe(50);
    expect(r.evidence[0]).toMatch(/1 of 4 paragraphs exceed 130 words/);
    expect(r.recommendation).toMatch(/Break up long paragraphs/);
  });

  it('passes when walls are within the 15% tolerance', () => {
    // 1 of 10 → 0.10 ≤ 0.15 → passed; score 100 - 20 = 80
    const paras = [para(200), ...Array(9).fill(para(40))];
    const r = check(pageWith(paras), { entityName: 'X' });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(80);
  });

  it('scores 0 when half or more are walls', () => {
    const r = check(pageWith([para(200), para(200), para(40), para(40)]), { entityName: 'X' });
    expect(r.score).toBe(0);
    expect(r.passed).toBe(false);
  });
});
