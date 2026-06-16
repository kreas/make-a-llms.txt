import type { Tier } from './types';

/** Human-readable label for each rubric check id. Single source of truth shared by
 *  the audit detail UI, the score card categories, and the exported report. */
export const CHECK_LABEL: Record<string, string> = {
  'h1-present': 'H1 present',
  'heading-hierarchy': 'Heading hierarchy clean',
  'meta-description': 'Meta description (120-160 chars)',
  'canonical': 'Canonical tag',
  'schema-type': 'Schema.org type',
  'schema-fields': 'Required schema fields',
  'answer-position': 'Answer in first 100 words',
  'entity-first-paragraph': 'Entity in first paragraph',
  'question-h2s': 'Question-style H2s',
  'lists-tables': 'Lists or tables present',
  'definitions': 'Definition pattern in opening',
  'freshness': 'Recently updated',
  'readability': 'Reading level grade 8-10',
  'named-entities': 'Named entities disambiguated',
  'internal-links': 'Internal links to related pages',
  'paragraph-length': 'Paragraphs are passage-sized',
  'section-chunking': 'Sections are well-chunked',
};

export const TIER_LABEL: Record<Tier, string> = {
  poor: 'Poor',
  fair: 'Fair',
  good: 'Good',
  excellent: 'Excellent',
};

export type Category = { key: string; label: string; checkIds: string[] };

/** The four scorecard categories that group the rubric checks. */
export const CATEGORIES: readonly Category[] = [
  {
    key: 'structure',
    label: 'Structure',
    checkIds: ['h1-present', 'heading-hierarchy', 'lists-tables', 'question-h2s'],
  },
  {
    key: 'answer-quality',
    label: 'Answer quality',
    checkIds: ['answer-position', 'entity-first-paragraph', 'definitions', 'readability'],
  },
  {
    key: 'metadata-schema',
    label: 'Metadata & schema',
    checkIds: ['meta-description', 'canonical', 'schema-type', 'schema-fields'],
  },
  {
    key: 'authority-freshness',
    label: 'Authority & freshness',
    checkIds: ['named-entities', 'internal-links', 'freshness'],
  },
] as const;

export type CategoryCheck = { id: string; score: number; weight: number };

/** Weighted-average score for the checks belonging to a category. */
export function aggregateCategory(checks: CategoryCheck[], ids: string[]) {
  const inCat = checks.filter((c) => ids.includes(c.id));
  const totalWeight = inCat.reduce((a, c) => a + c.weight, 0);
  if (totalWeight === 0) return { score: 0, totalWeight: 0 };
  const weightedSum = inCat.reduce((a, c) => a + c.score * c.weight, 0);
  return { score: Math.round(weightedSum / totalWeight), totalWeight };
}
