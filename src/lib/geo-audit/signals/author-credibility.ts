import type { GeoSignalDef } from '../types';

const RX = /\b(by [A-Z][a-z]+ [A-Z][a-z]+|about the author|author bio|written by|edited by|reviewed by|, (senior |staff |contributing )?(editor|writer|journalist|reporter|md|phd))\b/i;

export const authorCredibility: GeoSignalDef = {
  id: 'author-credibility',
  label: 'Author credibility',
  tags: ['trust'],
  defaultWeight: 25,
  urlPatterns: ['**/', '**/blog/**', '**/articles/**', '**/author/**'],
  gate: (p) =>
    RX.test(p.markdown)
      ? { signalId: 'author-credibility', url: p.url, path: p.path, reason: 'Has bylines / author bio' }
      : null,
  confirmPrompt: (e) =>
    `You audit whether ${e}'s content shows real AUTHOR CREDIBILITY — named authors with bylines and bios/credentials (E-E-A-T), not anonymous posts. Set confirmed=true only if a named author with some credential or bio is present. If confirmed, set artifact like "bylines + bios (e.g. Jane Doe, Editor)"; otherwise artifact=null. Reply only via the structured output.`,
  recommendation: 'Add named author bylines with short bios/credentials. AI weighs author expertise (E-E-A-T) when citing content.',
};
