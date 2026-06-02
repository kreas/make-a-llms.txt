import type { GeoSignalDef } from '../types';
import { socialProof } from './social-proof';
import { differentiation } from './differentiation';

const ALL: GeoSignalDef[] = [socialProof, differentiation];

export const SIGNAL_REGISTRY: Record<string, GeoSignalDef> = Object.fromEntries(
  ALL.map((s) => [s.id, s]),
);

export function getSignal(id: string): GeoSignalDef | undefined {
  return SIGNAL_REGISTRY[id];
}
