import type { GeoSignalDef } from '../types';

const URL_RX = /\/(pricing|plans|pricing-plans)(\/|$|\?)/i;
const CURRENCY = /[$€£]\s?\d/;
const PLAN_RX = /(per month|\/mo\b|\/month|per year|\/yr\b|starting at|starts at|free tier|free plan|billed annually|per seat)/i;

export const pricing: GeoSignalDef = {
  id: 'pricing',
  label: 'Public pricing page',
  tags: ['value'],
  defaultWeight: 40,
  urlPatterns: ['**/pricing**', '**/plans**'],
  gate: (p) => {
    if (URL_RX.test(p.url)) return { signalId: 'pricing', url: p.url, path: p.path, reason: 'URL looks like a pricing page' };
    if (CURRENCY.test(p.markdown) && PLAN_RX.test(p.markdown)) return { signalId: 'pricing', url: p.url, path: p.path, reason: 'Page shows prices with plan terms' };
    return null;
  },
  confirmPrompt: (e) =>
    `You audit whether a web page is a genuine PUBLIC PRICING page for ${e}. Set confirmed=true only if it shows at least one visible price or named plan/tier. If confirmed, set artifact to a short price hint like "from $29/mo · 3 tiers"; otherwise artifact=null. Reply only via the structured output.`,
  recommendation: 'Publish a public pricing or plans page. AI cannot recommend you on value if it cannot see what you cost.',
};
