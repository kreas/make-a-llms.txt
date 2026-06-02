import type { GeoSignalDef } from '../types';

const RATING = /\b\d(?:\.\d)?\s?(?:\/\s?5|out of 5|stars?|★)\b/i;
const COUNT = /\b\d{1,3}(?:,\d{3})*\+?\s+reviews?\b/i;
const STARS = /★{3,}/;

export const ratingsReviews: GeoSignalDef = {
  id: 'ratings-reviews',
  label: 'Ratings & review counts',
  tags: ['proof'],
  defaultWeight: 20,
  urlPatterns: ['**/', '**/reviews**'],
  gate: (p) =>
    RATING.test(p.markdown) || COUNT.test(p.markdown) || STARS.test(p.markdown)
      ? { signalId: 'ratings-reviews', url: p.url, path: p.path, reason: 'Numeric ratings / review counts present' }
      : null,
  confirmPrompt: (e) =>
    `You audit whether a web page exposes real NUMERIC ratings and/or review counts for ${e} (e.g. "4.8/5 from 320 reviews"), not just qualitative testimonials. Set confirmed=true only if a numeric rating or review count is present. If confirmed, set artifact like "4.8★ · 320 reviews"; otherwise artifact=null. Reply only via the structured output.`,
  recommendation: 'Expose numeric ratings and review counts (in text/HTML, not just a JS widget). Quantified validation is a strong AI recommendation input.',
};
