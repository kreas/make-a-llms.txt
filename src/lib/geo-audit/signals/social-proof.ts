import type { GeoSignalDef } from '../types';

const RX = /\b(testimonial|reviews?|rated|rating|★|⭐|trusted by|customers? love|case stud|endorse|G2|Trustpilot|five[- ]star|5[- ]star)\b/i;

export const socialProof: GeoSignalDef = {
  id: 'social-proof',
  label: 'Social proof',
  tags: ['proof', 'trust'],
  defaultWeight: 20,
  urlPatterns: ['**/', '**/reviews**', '**/testimonials**', '**/customers**'],
  gate: (p) =>
    RX.test(p.markdown)
      ? { signalId: 'social-proof', url: p.url, path: p.path, reason: 'Mentions reviews/testimonials/endorsements' }
      : null,
  confirmPrompt: (e) =>
    `You audit whether a web page shows genuine third-party SOCIAL PROOF for ${e} — real testimonials, named customer quotes, review counts, or star ratings. Set confirmed=true only if such proof is present (not a generic "trusted by" with no detail). If confirmed, set artifact to a short summary like "12 G2 reviews · 3 named testimonials"; otherwise artifact=null. Reply only via the structured output.`,
  recommendation: 'Add real testimonials, named customer quotes, or review counts. AI leans on third-party proof when deciding whom to recommend.',
};
