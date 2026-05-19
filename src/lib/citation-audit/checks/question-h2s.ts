import type { CheckResult, ParsedPage, CheckContext } from '../types';

export const ID = 'question-h2s';
export const WEIGHT = 7;

const STARTERS = /^(what|when|where|who|why|how|is|are|do|does|can|should)\b/i;

function isQuestion(s: string): boolean {
  const t = s.trim();
  return t.endsWith('?') || STARTERS.test(t);
}

export function check(parsed: ParsedPage, _ctx: CheckContext): CheckResult {
  const h2s = parsed.headings.filter((h) => h.level === 2);
  const qs = h2s.filter((h) => isQuestion(h.text));
  if (qs.length >= 2) {
    return {
      id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: [`${qs.length} question-style H2s: ${qs.map((q) => `"${q.text}"`).join(', ')}`],
      recommendation: null,
    };
  }
  if (qs.length === 1) {
    return {
      id: ID, weight: WEIGHT, passed: false, score: 50,
      evidence: ['Only 1 question-style H2.'],
      recommendation: 'Add at least one more H2 phrased as a question users actually ask (e.g., "How does this work?").',
    };
  }
  return {
    id: ID, weight: WEIGHT, passed: false, score: 0,
    evidence: [`${h2s.length} H2 headings, none phrased as questions.`],
    recommendation: 'Rewrite 2+ H2 headings as questions a user might ask ("What is X?", "How does X work?").',
  };
}
