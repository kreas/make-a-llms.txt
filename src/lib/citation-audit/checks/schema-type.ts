import type { CheckResult, ParsedPage, CheckContext } from '../types';

export const ID = 'schema-type';
export const WEIGHT = 10;

const RECOMMENDED = new Set([
  'Article', 'BlogPosting', 'NewsArticle', 'FAQPage', 'Product', 'Service',
  'Organization', 'AboutPage', 'WebSite',
]);

function typesOf(block: Record<string, unknown>): string[] {
  const t = block['@type'];
  if (Array.isArray(t)) return t.map(String);
  if (typeof t === 'string') return [t];
  return [];
}

export function check(parsed: ParsedPage, _ctx: CheckContext): CheckResult {
  if (parsed.jsonLd.length === 0) {
    return {
      id: ID, weight: WEIGHT, passed: false, score: 0,
      evidence: ['No JSON-LD blocks on page.'],
      recommendation: 'Add a JSON-LD <script type="application/ld+json"> block declaring an @type appropriate for this page (Article, Service, Product, FAQPage, etc.).',
    };
  }
  const allTypes = parsed.jsonLd.flatMap((b) => typesOf(b as Record<string, unknown>));
  const recommended = allTypes.filter((t) => RECOMMENDED.has(t));
  if (recommended.length > 0) {
    return {
      id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: [`Found Schema.org type(s): ${recommended.join(', ')}`],
      recommendation: null,
    };
  }
  const hasWebPage = allTypes.includes('WebPage');
  if (hasWebPage) {
    return {
      id: ID, weight: WEIGHT, passed: false, score: 50,
      evidence: ['Only generic WebPage type declared.'],
      recommendation: 'Replace or supplement WebPage with a more specific @type (Article, Service, Product, FAQPage, AboutPage).',
    };
  }
  return {
    id: ID, weight: WEIGHT, passed: false, score: 0,
    evidence: [`Unrecognized @type(s): ${allTypes.join(', ') || '(none)'}`],
    recommendation: 'Declare a Schema.org @type appropriate for this page (Article, Service, Product, FAQPage, AboutPage).',
  };
}
