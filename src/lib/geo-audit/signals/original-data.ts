import type { GeoSignalDef } from '../types';

const RX = /\b(our (survey|study|research|analysis|data|report)|we (surveyed|analyzed|studied|measured)|original (research|data)|first-party data|we found that|\d{2,}% of (respondents|users|customers))\b/i;

export const originalData: GeoSignalDef = {
  id: 'original-data',
  label: 'Original data or research',
  tags: ['evidence'],
  defaultWeight: 30,
  urlPatterns: ['**/', '**/blog/**', '**/research/**', '**/reports/**'],
  gate: (p) =>
    RX.test(p.markdown)
      ? { signalId: 'original-data', url: p.url, path: p.path, reason: 'First-party data / research language' }
      : null,
  confirmPrompt: (e) =>
    `You audit whether ${e} publishes ORIGINAL DATA or research — a first-party survey, study, dataset, or analysis (not just citing others). Set confirmed=true only if the data appears to be their own. If confirmed, set artifact like "survey of 1,200 users"; otherwise artifact=null. Reply only via the structured output.`,
  recommendation: 'Publish original research or data (a survey, benchmark, or analysis). First-party data is a top citation magnet for AI.',
};
