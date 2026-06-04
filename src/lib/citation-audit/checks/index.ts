import type { CheckModule } from '../types';
import * as h1Present from './h1-present';
import * as headingHierarchy from './heading-hierarchy';
import * as metaDescription from './meta-description';
import * as canonical from './canonical';
import * as schemaType from './schema-type';
import * as schemaFields from './schema-fields';
import * as answerPosition from './answer-position';
import * as entityFirstParagraph from './entity-first-paragraph';
import * as questionH2s from './question-h2s';
import * as listsTables from './lists-tables';
import * as definitions from './definitions';
import * as freshness from './freshness';
import * as readability from './readability';
import * as namedEntities from './named-entities';
import * as internalLinks from './internal-links';
import * as paragraphLength from './paragraph-length';
import * as sectionChunking from './section-chunking';

export const CHECKS: readonly CheckModule[] = [
  h1Present, headingHierarchy, metaDescription, canonical,
  schemaType, schemaFields, answerPosition, entityFirstParagraph,
  questionH2s, listsTables, definitions, freshness,
  readability, namedEntities, internalLinks,
  paragraphLength, sectionChunking,
] as const;
