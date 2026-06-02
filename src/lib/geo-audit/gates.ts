import type { GateMatch, GeoPageInput } from './types';

const PRICING_URL = /\/(pricing|plans|pricing-plans)(\/|$|\?)/i;
const CURRENCY = /[$€£]\s?\d/;
const PLAN_KEYWORDS = /(per month|\/mo\b|\/month|per year|\/yr\b|starting at|starts at|free tier|free plan|billed annually|per seat)/i;

const COMPARISON_URL = /\/(vs|compare|comparison|alternatives?|alternative-to)(\/|-|$|\?)/i;
const COMPARISON_TEXT = /\b[\w][\w .&-]{1,30}\s+vs\.?\s+[\w][\w .&-]{1,30}\b|\balternatives?\s+to\b/i;

const CASE_STUDY_URL = /\/(case-stud(y|ies)|customers?|success-stor(y|ies)|customer-stor(y|ies))(\/|$|\?)/i;
const METRIC = /\b\d+(\.\d+)?\s?(%|x|×)(?=\s|$)|[$€£]\s?\d[\d,]*\b|\b\d+\s?(hours?|days?|weeks?|months?|minutes?)\b/i;
const TESTIMONIAL = /\b(results?|achieved|increased|reduced|decreased|improved|grew|saved|boosted|cut|faster|roi|conversion)\b/i;

export function gatePage(p: GeoPageInput): GateMatch[] {
  const matches: GateMatch[] = [];
  const text = p.markdown;
  const base = { url: p.url, path: p.path };

  if (PRICING_URL.test(p.url)) {
    matches.push({ ...base, signal: 'pricing', reason: 'URL looks like a pricing page' });
  } else if (CURRENCY.test(text) && PLAN_KEYWORDS.test(text)) {
    matches.push({ ...base, signal: 'pricing', reason: 'Page shows prices with plan terms' });
  }

  if (COMPARISON_URL.test(p.url)) {
    matches.push({ ...base, signal: 'comparison', reason: 'URL looks like a comparison page' });
  } else if (COMPARISON_TEXT.test(text)) {
    matches.push({ ...base, signal: 'comparison', reason: 'Text compares against another named option' });
  }

  if (CASE_STUDY_URL.test(p.url)) {
    matches.push({ ...base, signal: 'case-study', reason: 'URL looks like a case study' });
  } else if (METRIC.test(text) && TESTIMONIAL.test(text)) {
    matches.push({ ...base, signal: 'case-study', reason: 'Page contains an outcome metric' });
  }

  return matches;
}
