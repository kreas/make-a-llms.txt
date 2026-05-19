import type { CheckResult, ParsedPage, CheckContext } from '../types';

export const ID = 'canonical';
export const WEIGHT = 3;

export function check(parsed: ParsedPage, _ctx: CheckContext): CheckResult {
  if (parsed.canonical) {
    return {
      id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: [`Canonical URL: ${parsed.canonical}`],
      recommendation: null,
    };
  }
  return {
    id: ID, weight: WEIGHT, passed: false, score: 0,
    evidence: ['No canonical link element.'],
    recommendation: 'Add <link rel="canonical" href="..."> to declare the preferred URL for this page.',
  };
}
