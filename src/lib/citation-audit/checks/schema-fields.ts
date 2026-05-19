import type { CheckResult, ParsedPage, CheckContext } from '../types';

export const ID = 'schema-fields';
export const WEIGHT = 5;

const REQUIRED: Record<string, string[]> = {
  Article: ['headline', 'datePublished', 'author'],
  BlogPosting: ['headline', 'datePublished', 'author'],
  NewsArticle: ['headline', 'datePublished', 'author'],
  Product: ['name', 'description'],
  Service: ['name', 'provider'],
  FAQPage: ['mainEntity'],
  Organization: ['name', 'url'],
  AboutPage: ['name'],
  WebSite: ['name', 'url'],
};

function typesOf(b: Record<string, unknown>): string[] {
  const t = b['@type'];
  return Array.isArray(t) ? t.map(String) : typeof t === 'string' ? [t] : [];
}

export function check(parsed: ParsedPage, _ctx: CheckContext): CheckResult {
  if (parsed.jsonLd.length === 0) {
    return {
      id: ID, weight: WEIGHT, passed: false, score: 0,
      evidence: ['No JSON-LD blocks; required-field check skipped.'],
      recommendation: 'Once a Schema.org @type is declared, include required fields for that type.',
    };
  }
  for (const block of parsed.jsonLd as Record<string, unknown>[]) {
    for (const t of typesOf(block)) {
      const required = REQUIRED[t];
      if (!required) continue;
      const present = required.filter((f) => block[f] != null);
      const missing = required.filter((f) => block[f] == null);
      if (missing.length === 0) {
        return {
          id: ID, weight: WEIGHT, passed: true, score: 100,
          evidence: [`All required ${t} fields present: ${present.join(', ')}.`],
          recommendation: null,
        };
      }
      const score = Math.round((present.length / required.length) * 100);
      return {
        id: ID, weight: WEIGHT, passed: false, score,
        evidence: [`${t} schema missing fields: ${missing.join(', ')}.`],
        recommendation: `Add the following fields to your ${t} JSON-LD: ${missing.join(', ')}.`,
      };
    }
  }
  return {
    id: ID, weight: WEIGHT, passed: false, score: 0,
    evidence: ['No recognized Schema.org type in JSON-LD.'],
    recommendation: 'Use a recognized @type and include its required fields.',
  };
}
