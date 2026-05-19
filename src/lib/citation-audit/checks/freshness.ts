import type { CheckResult, ParsedPage, CheckContext } from '../types';
import * as chrono from 'chrono-node';

export const ID = 'freshness';
export const WEIGHT = 8;

function pickDate(parsed: ParsedPage): Date | null {
  for (const b of parsed.jsonLd as Array<Record<string, unknown>>) {
    const dm = b['dateModified'] ?? b['datePublished'];
    if (typeof dm === 'string') {
      const d = new Date(dm);
      if (!isNaN(d.getTime())) return d;
    }
  }
  const meta = parsed.meta.find(
    (m) => m.property === 'article:modified_time' || m.property === 'article:published_time',
  );
  if (meta) {
    const d = new Date(meta.content);
    if (!isNaN(d.getTime())) return d;
  }
  const body = parsed.article?.textContent ?? '';
  const refs = chrono.parse(body);
  if (refs.length > 0) return refs[0].start.date();
  return null;
}

export function check(parsed: ParsedPage, _ctx: CheckContext): CheckResult {
  const date = pickDate(parsed);
  if (!date) {
    return {
      id: ID, weight: WEIGHT, passed: false, score: 0,
      evidence: ['No dateModified, datePublished, or recognizable date on page.'],
      recommendation: 'Add `dateModified` to your JSON-LD or an `article:modified_time` meta tag.',
    };
  }
  const monthsAgo = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  if (monthsAgo <= 18) {
    return {
      id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: [`Last updated ${Math.round(monthsAgo)} month(s) ago.`],
      recommendation: null,
    };
  }
  if (monthsAgo <= 36) {
    return {
      id: ID, weight: WEIGHT, passed: false, score: 50,
      evidence: [`Last updated ${Math.round(monthsAgo)} months ago.`],
      recommendation: 'Refresh this page and bump its dateModified — AI engines down-rank stale content.',
    };
  }
  return {
    id: ID, weight: WEIGHT, passed: false, score: 0,
    evidence: [`Last updated ${Math.round(monthsAgo)} months ago.`],
    recommendation: 'Substantially update this page and refresh its dateModified.',
  };
}
