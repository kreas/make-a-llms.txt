import type { CheckResult, ParsedPage, CheckContext } from '../types';
import { countWords } from '../text';

export const ID = 'paragraph-length';
export const WEIGHT = 5;

export const LONG_PARAGRAPH_WORDS = 130;
export const WALL_FRACTION_PASS = 0.15;

export function check(parsed: ParsedPage, _ctx: CheckContext): CheckResult {
  const counts = parsed.paragraphs.map(countWords);
  const total = counts.length;

  if (total === 0) {
    return {
      id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: ['No prose paragraphs to evaluate.'],
      recommendation: null,
    };
  }

  const longCounts = counts.filter((n) => n > LONG_PARAGRAPH_WORDS);
  const longFraction = longCounts.length / total;
  const score = Math.max(0, Math.min(100, Math.round(100 - longFraction * 200)));
  const passed = longFraction <= WALL_FRACTION_PASS;

  if (passed && longCounts.length === 0) {
    return {
      id: ID, weight: WEIGHT, passed: true, score,
      evidence: [`All ${total} paragraphs are within ${LONG_PARAGRAPH_WORDS} words.`],
      recommendation: null,
    };
  }

  const longest = Math.max(...counts);
  return {
    id: ID, weight: WEIGHT, passed, score,
    evidence: [`${longCounts.length} of ${total} paragraphs exceed ${LONG_PARAGRAPH_WORDS} words (longest: ${longest}).`],
    recommendation: passed
      ? null
      : 'Break up long paragraphs (over 130 words) into shorter, self-contained passages so AI models can extract and cite them cleanly.',
  };
}
