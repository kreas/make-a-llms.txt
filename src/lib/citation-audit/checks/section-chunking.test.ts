import { describe, it, expect } from 'vitest';
import { check } from './section-chunking';
import type { ParsedPage, Section } from '../types';

function pageWith(sections: Section[]): ParsedPage {
  return { paragraphs: [], sections } as unknown as ParsedPage;
}

describe('section-chunking', () => {
  it('passes/100 when every section is retrieval-sized', () => {
    const r = check(
      pageWith([
        { level: 2, heading: 'A', wordCount: 250 },
        { level: 2, heading: 'B', wordCount: 300 },
      ]),
      { entityName: 'X' },
    );
    expect(r.passed).toBe(true);
    expect(r.score).toBe(100);
  });

  it('passes/100 for a short page even with one section', () => {
    const r = check(pageWith([{ level: null, heading: null, wordCount: 350 }]), { entityName: 'X' });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(100);
    expect(r.evidence[0]).toMatch(/short enough to chunk/i);
  });

  it('fails when a section exceeds 400 words', () => {
    // 1 of 3 over → longFraction 1/3 → round(100 - 0.333*200)=33
    const r = check(
      pageWith([
        { level: 2, heading: 'Intro', wordCount: 200 },
        { level: 2, heading: 'Our Process', wordCount: 520 },
        { level: 2, heading: 'Pricing', wordCount: 150 },
      ]),
      { entityName: 'X' },
    );
    expect(r.passed).toBe(false);
    expect(r.score).toBe(33);
    expect(r.evidence[0]).toMatch(/1 section.* exceeds 400 words/);
    expect(r.evidence[0]).toMatch(/Our Process/);
    expect(r.recommendation).toMatch(/Add subheadings/);
  });

  it('fails hard for one giant no-heading blob', () => {
    const r = check(pageWith([{ level: null, heading: null, wordCount: 900 }]), { entityName: 'X' });
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
    expect(r.evidence[0]).toMatch(/intro \/ no heading/i);
  });

  it('passes/100 when there are no sections at all', () => {
    const r = check(pageWith([]), { entityName: 'X' });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(100);
  });
});
