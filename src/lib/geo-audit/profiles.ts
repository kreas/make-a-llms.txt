import type { Goal, SignalTag, SiteType } from './types';

export const UNIVERSAL_CORE = ['social-proof', 'differentiation'] as const;

export type SiteTypeProfile = {
  id: SiteType;
  label: string;
  detectionHint: string;
  bonusSignals: string[];
};

export const PROFILES: Record<SiteType, SiteTypeProfile> = {
  saas: {
    id: 'saas', label: 'B2B SaaS / software',
    detectionHint: 'sells software or a subscription product; has pricing, features, integrations, docs',
    bonusSignals: ['pricing', 'comparison', 'case-study'],
  },
  publisher: {
    id: 'publisher', label: 'Blog / publisher',
    detectionHint: 'primarily articles, posts, news, or editorial content; many article pages',
    bonusSignals: ['author-credibility', 'cited-sources', 'original-data'],
  },
  ecommerce: {
    id: 'ecommerce', label: 'Ecommerce / store',
    detectionHint: 'sells physical or digital products with product pages, cart, checkout',
    bonusSignals: ['pricing', 'product-detail', 'shipping-returns'],
  },
  local: {
    id: 'local', label: 'Local business',
    detectionHint: 'a physical location or service area; hours, address, bookings, menu',
    bonusSignals: ['location-hours', 'menu-services'],
  },
  services: {
    id: 'services', label: 'Agency / services',
    detectionHint: 'offers professional services or consulting; portfolio, clients, engagements',
    bonusSignals: ['case-study', 'client-proof', 'service-offerings'],
  },
  other: {
    id: 'other', label: 'Other',
    detectionHint: 'does not clearly fit the other categories',
    bonusSignals: [],
  },
};

export function activeSignalIds(type: SiteType): string[] {
  return [...UNIVERSAL_CORE, ...PROFILES[type].bonusSignals];
}

export const GOAL_BOOSTS: Record<Goal, { tags: SignalTag[]; multiplier: number }> = {
  'get-cited': { tags: ['evidence'], multiplier: 1.5 },
  'win-comparisons': { tags: ['comparison', 'value'], multiplier: 1.5 },
  'build-trust': { tags: ['proof', 'trust'], multiplier: 1.5 },
};
