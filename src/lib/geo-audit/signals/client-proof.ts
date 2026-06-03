import type { GeoSignalDef } from '../types';

const RX = /\b(our clients|trusted by|client list|portfolio|brands we|companies we|worked with|featured clients|our work|selected work|client roster)\b/i;

export const clientProof: GeoSignalDef = {
  id: 'client-proof',
  label: 'Client proof',
  tags: ['proof'],
  defaultWeight: 30,
  urlPatterns: ['**/clients**', '**/work**', '**/portfolio**', '**/customers**'],
  gate: (p) =>
    RX.test(p.markdown)
      ? { signalId: 'client-proof', url: p.url, path: p.path, reason: 'Named clients / portfolio present' }
      : null,
  confirmPrompt: (e) =>
    `You audit whether a web page proves ${e}'s track record — names specific clients, shows client logos, or a portfolio of delivered work. Set confirmed=true only if specific clients or work are shown (not a generic "trusted by thousands"). If confirmed, set artifact like "12 named clients" or "portfolio of 8 projects"; otherwise artifact=null. Reply only via the structured output.`,
  recommendation: "Name your clients or show a portfolio of real work. AI recommends agencies that can prove who they've delivered for.",
};
