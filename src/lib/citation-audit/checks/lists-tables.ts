import type { CheckResult, ParsedPage, CheckContext } from '../types';

export const ID = 'lists-tables';
export const WEIGHT = 5;

export function check(parsed: ParsedPage, _ctx: CheckContext): CheckResult {
  const lists = parsed.document.querySelectorAll('ul, ol').length;
  const tables = parsed.document.querySelectorAll('table').length;
  if (lists + tables > 0) {
    return {
      id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: [`Found ${lists} list(s) and ${tables} table(s).`],
      recommendation: null,
    };
  }
  return {
    id: ID, weight: WEIGHT, passed: false, score: 0,
    evidence: ['No lists or tables on the page.'],
    recommendation: 'Add a bulleted list or comparison table where the page covers multiple options, steps, or features.',
  };
}
