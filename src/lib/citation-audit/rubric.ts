import type { Tier } from './types';

export type RubricEntry = { id: string; weight: number };

export const RUBRIC: readonly RubricEntry[] = [
  { id: 'h1-present', weight: 5 },
  { id: 'heading-hierarchy', weight: 5 },
  { id: 'meta-description', weight: 5 },
  { id: 'canonical', weight: 3 },
  { id: 'schema-type', weight: 10 },
  { id: 'schema-fields', weight: 5 },
  { id: 'answer-position', weight: 15 },
  { id: 'entity-first-paragraph', weight: 8 },
  { id: 'question-h2s', weight: 7 },
  { id: 'lists-tables', weight: 5 },
  { id: 'definitions', weight: 5 },
  { id: 'freshness', weight: 8 },
  { id: 'readability', weight: 5 },
  { id: 'named-entities', weight: 9 },
  { id: 'internal-links', weight: 5 },
  { id: 'paragraph-length', weight: 5 },
  { id: 'section-chunking', weight: 5 },
] as const;

export const RUBRIC_WEIGHTS_TOTAL = RUBRIC.reduce((a, r) => a + r.weight, 0);

export function tierFor(score: number): Tier {
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'good';
  if (score >= 50) return 'fair';
  return 'poor';
}
