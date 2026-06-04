import type { CheckResult, ParsedPage, CheckContext, Section } from '../types';

export const ID = 'section-chunking';
export const WEIGHT = 5;

export const LONG_SECTION_WORDS = 400;
export const SHORT_PAGE_WORDS = 400;

function label(s: Section): string {
  return s.heading ?? 'intro / no heading';
}

export function check(parsed: ParsedPage, _ctx: CheckContext): CheckResult {
  const sections = parsed.sections;
  const total = sections.length;

  if (total === 0) {
    return {
      id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: ['No body content to chunk.'],
      recommendation: null,
    };
  }

  const totalWords = sections.reduce((a, s) => a + s.wordCount, 0);
  if (totalWords < SHORT_PAGE_WORDS) {
    return {
      id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: ['Page is short enough to chunk cleanly.'],
      recommendation: null,
    };
  }

  const longSections = sections.filter((s) => s.wordCount > LONG_SECTION_WORDS);
  const longFraction = longSections.length / total;
  const score = Math.max(0, Math.min(100, Math.round(100 - longFraction * 200)));
  // Zero-tolerance: any single over-long section fails this check (stricter than paragraph-length by design).
  const passed = longSections.length === 0;

  if (passed) {
    return {
      id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: [`All ${total} sections are within ${LONG_SECTION_WORDS} words.`],
      recommendation: null,
    };
  }

  const largest = longSections.reduce((a, s) => (s.wordCount > a.wordCount ? s : a));
  return {
    id: ID, weight: WEIGHT, passed: false, score,
    evidence: [
      `${longSections.length} section${longSections.length === 1 ? '' : 's'} exceed${longSections.length === 1 ? 's' : ''} ${LONG_SECTION_WORDS} words without a subheading (largest: "${label(largest)}" — ${largest.wordCount} words).`,
    ],
    recommendation: `Add subheadings to break long sections (over ${LONG_SECTION_WORDS} words) into retrieval-sized chunks AI models can pull from.`,
  };
}
