import type { GeoSignalDef } from '../types';
import { socialProof } from './social-proof';
import { differentiation } from './differentiation';
import { pricing } from './pricing';
import { comparison } from './comparison';
import { caseStudy } from './case-study';

const ALL: GeoSignalDef[] = [socialProof, differentiation, pricing, comparison, caseStudy];

export const SIGNAL_REGISTRY: Record<string, GeoSignalDef> = Object.fromEntries(
  ALL.map((s) => [s.id, s]),
);

export function getSignal(id: string): GeoSignalDef | undefined {
  return SIGNAL_REGISTRY[id];
}
