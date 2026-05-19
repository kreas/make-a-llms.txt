import type { CheckResult, ParsedPage, CheckContext } from '../types';

export const ID = 'definitions';
export const WEIGHT = 5;

const PATTERN = /\b[A-Z][\w-]+(?:\s+[A-Z][\w-]+)*\s+(is|means|refers to)\s+/;

export function check(parsed: ParsedPage, _ctx: CheckContext): CheckResult {
  const firstP = parsed.document.querySelector('p')?.textContent ?? parsed.article?.textContent ?? '';
  if (!firstP.trim()) {
    return {
      id: ID, weight: WEIGHT, passed: false, score: 0,
      evidence: ['No opening paragraph text.'],
      recommendation: 'Add an opening sentence that defines the topic in "X is Y" form.',
    };
  }
  const match = firstP.match(PATTERN);
  if (match) {
    return {
      id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: [`Definition pattern: "${match[0].trim()}..."`],
      recommendation: null,
    };
  }
  return {
    id: ID, weight: WEIGHT, passed: false, score: 0,
    evidence: ['Opening paragraph lacks a definition pattern.'],
    recommendation: 'Open the page with a sentence in the form "X is Y" so LLMs can extract a clean definition.',
  };
}
