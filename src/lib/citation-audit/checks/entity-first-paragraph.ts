import type { CheckResult, ParsedPage, CheckContext } from '../types';

export const ID = 'entity-first-paragraph';
export const WEIGHT = 8;

export function check(parsed: ParsedPage, ctx: CheckContext): CheckResult {
  const firstP = parsed.document.querySelector('p')?.textContent?.trim() ?? '';
  if (!firstP) {
    return {
      id: ID, weight: WEIGHT, passed: false, score: 0,
      evidence: ['No paragraph elements found.'],
      recommendation: `Add an opening paragraph that names "${ctx.entityName}".`,
    };
  }
  if (firstP.toLowerCase().includes(ctx.entityName.toLowerCase())) {
    return {
      id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: [`First paragraph names "${ctx.entityName}".`],
      recommendation: null,
    };
  }
  return {
    id: ID, weight: WEIGHT, passed: false, score: 0,
    evidence: [`First paragraph: "${firstP.slice(0, 120)}${firstP.length > 120 ? '…' : ''}"`],
    recommendation: `Rewrite the first paragraph to include "${ctx.entityName}".`,
  };
}
