import type { GeoSignalDef } from '../types';

const URL_RX = /\/(vs|compare|comparison|alternatives?|alternative-to)(\/|$|\?)/i;
const TEXT_RX = /\b[\w][\w .&-]{1,30}\s+vs\.?\s+[\w][\w .&-]{1,30}\b|\balternatives?\s+to\b/i;

export const comparison: GeoSignalDef = {
  id: 'comparison',
  label: 'Competitor comparison',
  tags: ['comparison'],
  defaultWeight: 30,
  urlPatterns: ['**/vs/**', '**/compare**', '**/comparison**', '**/alternatives**'],
  gate: (p) => {
    if (URL_RX.test(p.url)) return { signalId: 'comparison', url: p.url, path: p.path, reason: 'URL looks like a comparison page' };
    if (TEXT_RX.test(p.markdown)) return { signalId: 'comparison', url: p.url, path: p.path, reason: 'Text compares against another named option' };
    return null;
  },
  confirmPrompt: (e) =>
    `You audit whether a web page directly compares ${e} against a specifically named competitor. Set confirmed=true only if at least one named competitor is compared head to head. If confirmed, set artifact to the competitor name(s), comma separated; otherwise artifact=null. Reply only via the structured output.`,
  recommendation: 'Publish a "You vs [competitor]" or "alternatives to" page so AI has a sourced answer when buyers compare named rivals.',
};
