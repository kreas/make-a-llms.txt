import type { CheckResult, ParsedPage, CheckContext } from '../types';

export const ID = 'meta-description';
export const WEIGHT = 5;

export function check(parsed: ParsedPage, _ctx: CheckContext): CheckResult {
  const desc = parsed.metaDescription;
  if (!desc || !desc.trim()) {
    return {
      id: ID, weight: WEIGHT, passed: false, score: 0,
      evidence: ['No <meta name="description"> tag.'],
      recommendation: 'Add a meta description summarizing the page in 120-160 characters.',
    };
  }
  const len = desc.trim().length;
  if (len >= 120 && len <= 160) {
    return {
      id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: [`Meta description present (${len} chars).`],
      recommendation: null,
    };
  }
  return {
    id: ID, weight: WEIGHT, passed: false, score: 60,
    evidence: [`Meta description present but ${len} chars (target: 120-160).`],
    recommendation: `Resize the meta description to 120-160 characters (currently ${len}).`,
  };
}
