import type { CheckResult, ParsedPage, CheckContext } from '../types';

export const ID = 'heading-hierarchy';
export const WEIGHT = 5;

export function check(parsed: ParsedPage, _ctx: CheckContext): CheckResult {
  // Use document-order traversal so skips are detected correctly regardless
  // of how ParsedPage.headings groups them by level.
  const domHeadings = Array.from(
    parsed.document.querySelectorAll('h1,h2,h3,h4,h5,h6'),
  ).map((h) => ({ level: parseInt(h.tagName[1], 10) }));

  let skips = 0;
  let prev = 0;
  for (const h of domHeadings) {
    if (prev > 0 && h.level > prev + 1) skips++;
    prev = h.level;
  }

  if (skips === 0) {
    return {
      id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: [`${domHeadings.length} headings, no skipped levels.`],
      recommendation: null,
    };
  }
  if (skips === 1) {
    return {
      id: ID, weight: WEIGHT, passed: false, score: 50,
      evidence: ['One heading-level skip detected.'],
      recommendation: 'Avoid skipping heading levels (e.g., H1 directly to H3). Insert the missing level or demote the deeper heading.',
    };
  }
  return {
    id: ID, weight: WEIGHT, passed: false, score: 0,
    evidence: [`${skips} heading-level skips detected.`],
    recommendation: 'Restructure headings so each level is one deeper than the previous (H1 → H2 → H3).',
  };
}
