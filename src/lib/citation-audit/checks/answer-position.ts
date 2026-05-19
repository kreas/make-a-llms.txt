import type { CheckResult, ParsedPage, CheckContext } from '../types';

export const ID = 'answer-position';
export const WEIGHT = 15;

function firstNWords(text: string, n: number): string {
  return text.split(/\s+/).filter(Boolean).slice(0, n).join(' ');
}

export function check(parsed: ParsedPage, ctx: CheckContext): CheckResult {
  const body = parsed.article?.textContent ?? parsed.document.body?.textContent ?? '';
  const opening = firstNWords(body, 100);
  if (!opening) {
    return {
      id: ID, weight: WEIGHT, passed: false, score: 0,
      evidence: ['Page has no readable body text.'],
      recommendation: `Add a short opening paragraph that names "${ctx.entityName}" and summarizes the page in 1-2 sentences.`,
    };
  }
  const hasEntity = ctx.entityName.length > 0 &&
    opening.toLowerCase().includes(ctx.entityName.toLowerCase());
  const hasSummary = /[.!?]/.test(opening);

  if (hasEntity && hasSummary) {
    return {
      id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: [`First 100 words contain entity "${ctx.entityName}" and a summary sentence.`],
      recommendation: null,
    };
  }
  if (hasSummary || hasEntity) {
    const missing = !hasEntity ? `the entity name "${ctx.entityName}"` : 'a summary sentence';
    return {
      id: ID, weight: WEIGHT, passed: false, score: 50,
      evidence: [`First 100 words missing ${missing}.`],
      recommendation: `Add ${missing} to the opening paragraph (within the first 100 words).`,
    };
  }
  return {
    id: ID, weight: WEIGHT, passed: false, score: 0,
    evidence: ['Opening paragraph lacks both entity name and summary sentence.'],
    recommendation: `Rewrite the opening so the first 1-2 sentences name "${ctx.entityName}" and state what the page is about.`,
  };
}
