import type { CheckResult, ParsedPage, CheckContext } from '../types';

export const ID = 'internal-links';
export const WEIGHT = 5;

export function check(parsed: ParsedPage, _ctx: CheckContext): CheckResult {
  const internal = parsed.links.filter(
    (l) =>
      l.isInternal &&
      !l.href.startsWith(parsed.url + '#') &&
      l.href !== parsed.url,
  );
  if (internal.length >= 3) {
    return {
      id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: [`${internal.length} internal links.`],
      recommendation: null,
    };
  }
  if (internal.length > 0) {
    return {
      id: ID, weight: WEIGHT, passed: false, score: 60,
      evidence: [`Only ${internal.length} internal link(s).`],
      recommendation: 'Link to at least 3 related pages on this site to signal topic-cluster relevance.',
    };
  }
  return {
    id: ID, weight: WEIGHT, passed: false, score: 0,
    evidence: ['No internal links found.'],
    recommendation: 'Add internal links to related pages so AI engines can map the topic cluster.',
  };
}
