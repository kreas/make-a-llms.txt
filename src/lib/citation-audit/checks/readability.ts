import type { CheckResult, ParsedPage, CheckContext } from '../types';
import rs from 'text-readability';

export const ID = 'readability';
export const WEIGHT = 5;

export function check(parsed: ParsedPage, _ctx: CheckContext): CheckResult {
  const text = parsed.article?.textContent ?? parsed.document.body?.textContent ?? '';
  if (text.trim().length < 100) {
    return {
      id: ID, weight: WEIGHT, passed: false, score: 0,
      evidence: ['Insufficient body text for readability scoring.'],
      recommendation: 'Add at least a few paragraphs of substantive content.',
    };
  }
  const grade = rs.fleschKincaidGrade(text);
  if (grade >= 8 && grade <= 10) {
    return {
      id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: [`Flesch–Kincaid grade ${grade.toFixed(1)} (target 8-10).`],
      recommendation: null,
    };
  }
  if ((grade >= 6 && grade < 8) || (grade > 10 && grade <= 13)) {
    return {
      id: ID, weight: WEIGHT, passed: false, score: 60,
      evidence: [`Flesch–Kincaid grade ${grade.toFixed(1)} (target 8-10).`],
      recommendation: grade < 8
        ? 'Add precision; current prose may be too simple for the audience.'
        : 'Simplify sentence length and word choice. Aim for grade 8-10.',
    };
  }
  return {
    id: ID, weight: WEIGHT, passed: false, score: 0,
    evidence: [`Flesch–Kincaid grade ${grade.toFixed(1)} is outside the target range.`],
    recommendation: 'Rewrite for grade level 8-10 — short, declarative sentences with concrete nouns.',
  };
}
