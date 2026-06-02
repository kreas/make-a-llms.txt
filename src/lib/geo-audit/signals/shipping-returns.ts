import type { GeoSignalDef } from '../types';

const RX = /\b(free shipping|shipping (policy|info|rates?|options?)|returns?(\s+policy)?|refunds?|delivery|exchanges?|money[- ]back|30[- ]day)\b/i;

export const shippingReturns: GeoSignalDef = {
  id: 'shipping-returns',
  label: 'Shipping & returns',
  tags: ['trust'],
  defaultWeight: 20,
  urlPatterns: ['**/shipping**', '**/returns**', '**/delivery**', '**/refund**'],
  gate: (p) =>
    RX.test(p.markdown)
      ? { signalId: 'shipping-returns', url: p.url, path: p.path, reason: 'Shipping/returns policy present' }
      : null,
  confirmPrompt: (e) =>
    `You audit whether a web page states ${e}'s SHIPPING and RETURNS policies clearly — shipping rates/options and a return/refund policy. Set confirmed=true only if real policy detail is present. If confirmed, set artifact like "free shipping + 30-day returns"; otherwise artifact=null. Reply only via the structured output.`,
  recommendation: 'Publish clear shipping and return policies. AI factors trust and friction into which stores it recommends.',
};
