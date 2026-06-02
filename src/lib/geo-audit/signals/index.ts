import type { GeoSignalDef } from '../types';
import { socialProof } from './social-proof';
import { differentiation } from './differentiation';
import { pricing } from './pricing';
import { comparison } from './comparison';
import { caseStudy } from './case-study';
import { authorCredibility } from './author-credibility';
import { citedSources } from './cited-sources';
import { originalData } from './original-data';
import { locationHours } from './location-hours';
import { menuServices } from './menu-services';
import { clientProof } from './client-proof';
import { serviceOfferings } from './service-offerings';
import { productDetail } from './product-detail';
import { shippingReturns } from './shipping-returns';

const ALL: GeoSignalDef[] = [
  socialProof, differentiation,
  pricing, comparison, caseStudy,
  authorCredibility, citedSources, originalData,
  locationHours, menuServices, clientProof, serviceOfferings, productDetail, shippingReturns,
];

export const SIGNAL_REGISTRY: Record<string, GeoSignalDef> = Object.fromEntries(
  ALL.map((s) => [s.id, s]),
);

export function getSignal(id: string): GeoSignalDef | undefined {
  return SIGNAL_REGISTRY[id];
}
