import type { GeoSignalDef } from '../types';

const FAQ = /\b(faq|frequently asked|q&a|q:\s)\b/i;

export const topicalDepth: GeoSignalDef = {
  id: 'topical-depth',
  label: 'Topical depth',
  tags: ['evidence'],
  defaultWeight: 25,
  urlPatterns: ['**/'],
  gate: (p) => {
    const headings = (p.markdown.match(/^#{2,3}\s/gm) ?? []).length;
    const deep = (p.markdown.length > 1200 && headings >= 3) || FAQ.test(p.markdown);
    return deep
      ? { signalId: 'topical-depth', url: p.url, path: p.path, reason: 'Long-form / multi-section / FAQ content' }
      : null;
  },
  confirmPrompt: (e) =>
    `You audit whether a web page from ${e} has genuine TOPICAL DEPTH — comprehensive, fact-dense coverage (multiple facts, sections, comparisons, or an FAQ) a model could extract many answers from, not a thin page. Set confirmed=true only if it is genuinely substantial. If confirmed, set artifact like "in-depth guide · 8 sections + FAQ"; otherwise artifact=null. Reply only via the structured output.`,
  recommendation: 'Publish in-depth, fact-dense pages (guides, FAQs, comparisons) rather than thin ones. AI cites pages it can pull many facts from.',
};
