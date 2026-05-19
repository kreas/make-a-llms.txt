import type { CheckResult, ParsedPage, CheckContext } from '../types';

export const ID = 'h1-present';
export const WEIGHT = 5;

export function check(parsed: ParsedPage, _ctx: CheckContext): CheckResult {
  const h1s = parsed.headings.filter((h) => h.level === 1);
  if (h1s.length === 1) {
    return {
      id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: [`H1 found: '${h1s[0].text}'`],
      recommendation: null,
    };
  }
  if (h1s.length === 0) {
    return {
      id: ID, weight: WEIGHT, passed: false, score: 0,
      evidence: ['No <h1> element found.'],
      recommendation: 'Add a single, descriptive H1 to the top of the page that summarizes the topic.',
    };
  }
  return {
    id: ID, weight: WEIGHT, passed: false, score: 0,
    evidence: [`${h1s.length} H1 elements found.`],
    recommendation: 'Use a single H1 per page; demote the extra H1s to H2.',
  };
}
