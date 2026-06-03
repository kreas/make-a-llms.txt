import type { GeoSignalDef } from '../types';

const RX = /\b(menu|appetizers?|entr[ée]es?|mains?|desserts?|our services|what we offer|service menu|packages?|price list)\b/i;

export const menuServices: GeoSignalDef = {
  id: 'menu-services',
  label: 'Menu or services list',
  tags: ['value'],
  defaultWeight: 25,
  urlPatterns: ['**/menu**', '**/services**', '**/offerings**'],
  gate: (p) =>
    RX.test(p.markdown) || /\/(menu|services)\b/i.test(p.url)
      ? { signalId: 'menu-services', url: p.url, path: p.path, reason: 'Menu or services listing present' }
      : null,
  confirmPrompt: (e) =>
    `You audit whether a web page lists ${e}'s actual MENU or SERVICES with specifics (named dishes/items or named services), not just a vague tagline. Set confirmed=true only if there is a concrete list. If confirmed, set artifact like "full dinner menu" or "6 named services"; otherwise artifact=null. Reply only via the structured output.`,
  recommendation: 'Publish your menu or a specific list of services (real items, not just categories). AI recommends what it can actually describe.',
};
