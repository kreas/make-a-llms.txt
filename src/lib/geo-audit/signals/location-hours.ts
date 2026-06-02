import type { GeoSignalDef } from '../types';

const PHONE = /\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/;
const ADDRESS = /\b\d{1,5}\s+\w+(?:\s+\w+){0,4}\s+(st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|way|hwy|suite|ste)\b/i;
const HOURS = /\b(hours?|open(?:ing)?)\b/i;
const TIME = /\b\d{1,2}(?::\d{2})?\s?(?:a\.?m\.?|p\.?m\.?)\b/i;

export const locationHours: GeoSignalDef = {
  id: 'location-hours',
  label: 'Location & hours',
  tags: ['trust'],
  defaultWeight: 35,
  urlPatterns: ['**/locations**', '**/contact**', '**/visit**', '**/hours**'],
  gate: (p) =>
    PHONE.test(p.markdown) || ADDRESS.test(p.markdown) || (HOURS.test(p.markdown) && TIME.test(p.markdown))
      ? { signalId: 'location-hours', url: p.url, path: p.path, reason: 'Address, phone, or opening hours present' }
      : null,
  confirmPrompt: (e) =>
    `You audit whether a web page publishes real LOCATION & HOURS for ${e} — a physical street address, opening hours, or map/directions. Set confirmed=true only if an address or opening hours are actually present. If confirmed, set artifact to a short summary like "address + hours · 3 locations"; otherwise artifact=null. Reply only via the structured output.`,
  recommendation: "Publish your address, opening hours, and a map. AI can't recommend a local business it can't locate or tell people when you're open.",
};
