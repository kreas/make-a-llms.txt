import type { CheckResult, ParsedPage, CheckContext } from '../types';
import nlp from 'compromise';

export const ID = 'named-entities';
export const WEIGHT = 9;

function extract(text: string): string[] {
  const doc = nlp(text);
  const orgs: string[] = doc.organizations().out('array');
  const people: string[] = doc.people().out('array');
  const places: string[] = doc.places().out('array');
  return Array.from(
    new Set([...orgs, ...people, ...places].map((s) => s.trim()).filter(Boolean)),
  );
}

function hasDisambiguation(parsed: ParsedPage): boolean {
  for (const b of parsed.jsonLd as Array<Record<string, unknown>>) {
    if (typeof b['sameAs'] === 'string' && /wikipedia|wikidata/.test(b['sameAs'] as string)) {
      return true;
    }
    if (
      Array.isArray(b['sameAs']) &&
      (b['sameAs'] as string[]).some((s) => /wikipedia|wikidata/.test(s))
    ) {
      return true;
    }
  }
  return parsed.links.some((l) => /wikipedia\.org|wikidata\.org/.test(l.href));
}

export function check(parsed: ParsedPage, _ctx: CheckContext): CheckResult {
  const body = parsed.article?.textContent ?? parsed.document.body?.textContent ?? '';
  const entities = extract(body);
  if (entities.length < 3) {
    return {
      id: ID, weight: WEIGHT, passed: false, score: 0,
      evidence: [`Found ${entities.length} named entities (target ≥3).`],
      recommendation:
        'Name the specific organizations, products, or people relevant to the topic so LLMs can disambiguate.',
    };
  }
  if (hasDisambiguation(parsed)) {
    return {
      id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: [
        `Entities: ${entities.slice(0, 5).join(', ')}. Disambiguation via Wikipedia/Wikidata link found.`,
      ],
      recommendation: null,
    };
  }
  return {
    id: ID, weight: WEIGHT, passed: false, score: 60,
    evidence: [`Entities: ${entities.slice(0, 5).join(', ')}. No disambiguation links.`],
    recommendation:
      'Add `sameAs` Wikipedia/Wikidata links in your JSON-LD or hyperlink at least one entity to its authoritative page.',
  };
}
