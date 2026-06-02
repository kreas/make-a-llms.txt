import type { GeoSignalDef } from '../types';

const URL_RX = /\/(case-stud(y|ies)|customers?|success-stor(y|ies)|customer-stor(y|ies))(\/|$|\?)/i;
const METRIC = /\b\d+(\.\d+)?\s?(%|x|×)(?=\s|$)|[$€£]\s?\d[\d,]*\b|\b\d+\s?(hours?|days?|weeks?|months?|minutes?)\b/i;
const TESTIMONIAL = /\b(results?|achieved|increased|reduced|decreased|improved|grew|saved|boosted|cut|faster|roi|conversion)\b/i;

export const caseStudy: GeoSignalDef = {
  id: 'case-study',
  label: 'Case study with a metric',
  tags: ['evidence', 'proof'],
  defaultWeight: 30,
  urlPatterns: ['**/case-stud**', '**/customers**', '**/success**'],
  gate: (p) => {
    if (URL_RX.test(p.url)) return { signalId: 'case-study', url: p.url, path: p.path, reason: 'URL looks like a case study' };
    if (METRIC.test(p.markdown) && TESTIMONIAL.test(p.markdown)) return { signalId: 'case-study', url: p.url, path: p.path, reason: 'Page contains an outcome metric' };
    return null;
  },
  confirmPrompt: (e) =>
    `You audit whether a web page is a genuine customer CASE STUDY for ${e} containing a concrete outcome metric (a real number: %, multiple, time, or money). Set confirmed=true only if such a metric is present. If confirmed, set artifact to the headline metric like "40% faster onboarding"; otherwise artifact=null. Reply only via the structured output.`,
  recommendation: 'Publish a customer case study with a concrete outcome metric (a real %, multiple, time saved, or dollar figure).',
};
