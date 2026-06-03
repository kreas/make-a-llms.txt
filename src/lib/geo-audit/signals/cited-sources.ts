import type { GeoSignalDef } from '../types';

const RX = /\b(according to|source:|sources:|references?:|cited|\[\d+\]|study (found|showed)|research (from|by))\b/i;
const OUTBOUND = /\]\(https?:\/\//;

export const citedSources: GeoSignalDef = {
  id: 'cited-sources',
  label: 'Cited sources',
  tags: ['evidence'],
  defaultWeight: 15,
  urlPatterns: ['**/', '**/blog/**', '**/articles/**'],
  gate: (p) =>
    RX.test(p.markdown) || OUTBOUND.test(p.markdown)
      ? { signalId: 'cited-sources', url: p.url, path: p.path, reason: 'References or outbound citations present' }
      : null,
  confirmPrompt: (e) =>
    `You audit whether ${e}'s content CITES SOURCES — references primary sources, studies, or data with attribution/links. Set confirmed=true only if there is real sourcing, not just internal links. If confirmed, set artifact like "cites 3 external studies"; otherwise artifact=null. Reply only via the structured output.`,
  recommendation: 'Cite primary sources and link to them. Sourced content is far more likely to be quoted by AI.',
};
