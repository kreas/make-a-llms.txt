import type { CheckResult, Tier } from './types';
import { aggregate } from './score';

export type Pillar = 'readable' | 'recommendable' | 'recognized';

export const PILLARS: readonly Pillar[] = ['readable', 'recommendable', 'recognized'] as const;

/** Maps each rubric check id to its pillar (spec §5). Weights live in rubric.ts. */
export const PILLAR_OF: Record<string, Pillar> = {
  // Readable (AEO)
  'answer-position': 'readable',
  'freshness': 'readable',
  'question-h2s': 'readable',
  'h1-present': 'readable',
  'heading-hierarchy': 'readable',
  'definitions': 'readable',
  'readability': 'readable',
  'internal-links': 'readable',
  'paragraph-length': 'readable',
  'section-chunking': 'readable',
  // Recommendable (GEO)
  'lists-tables': 'recommendable',
  // Recognized (AIO)
  'schema-type': 'recognized',
  'named-entities': 'recognized',
  'entity-first-paragraph': 'recognized',
  'schema-fields': 'recognized',
  'meta-description': 'recognized',
  'canonical': 'recognized',
};

export function pillarOf(checkId: string): Pillar | undefined {
  return PILLAR_OF[checkId];
}

/** Weighted score for one pillar's checks within a page. Null if none present. */
export function scorePillar(
  checks: CheckResult[],
  pillar: Pillar,
): { score: number; tier: Tier } | null {
  const subset = checks.filter((c) => PILLAR_OF[c.id] === pillar);
  if (subset.length === 0) return null;
  return aggregate(subset);
}
