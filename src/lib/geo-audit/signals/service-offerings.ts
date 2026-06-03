import type { GeoSignalDef } from '../types';

const RX = /\b(our services|what we do|capabilities|services? include|we offer|areas of expertise|disciplines|our solutions|service offerings)\b/i;

export const serviceOfferings: GeoSignalDef = {
  id: 'service-offerings',
  label: 'Service offerings',
  tags: ['value'],
  defaultWeight: 25,
  urlPatterns: ['**/services**', '**/what-we-do**', '**/capabilities**', '**/solutions**'],
  gate: (p) =>
    RX.test(p.markdown)
      ? { signalId: 'service-offerings', url: p.url, path: p.path, reason: 'Specific service/capability list present' }
      : null,
  confirmPrompt: (e) =>
    `You audit whether a web page lists ${e}'s specific SERVICES or capabilities (named disciplines/offerings), not just a tagline. Set confirmed=true only if there is a concrete list a buyer could match a need against. If confirmed, set artifact like "5 named service lines"; otherwise artifact=null. Reply only via the structured output.`,
  recommendation: 'List your specific services and capabilities, not just a tagline. AI needs to know exactly what you do to match you to a need.',
};
