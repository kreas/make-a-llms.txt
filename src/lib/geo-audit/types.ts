import type { Tier } from '@/lib/citation-audit/types';

export type GeoSignalId = 'pricing' | 'comparison' | 'case-study';

/** Existence weights — sum to 100 so a score is already 0–100 (spec §5). */
export const GEO_SIGNAL_WEIGHTS: Record<GeoSignalId, number> = {
  pricing: 40,
  comparison: 30,
  'case-study': 30,
};

export const GEO_SIGNALS: readonly GeoSignalId[] = ['pricing', 'comparison', 'case-study'] as const;

export type GeoPageInput = {
  url: string;
  path: string;
  markdown: string;
};

/** A heuristic gate firing: this page is a candidate for one signal. */
export type GateMatch = {
  signal: GeoSignalId;
  url: string;
  path: string;
  reason: string;
};

/** LLM confirm output for one candidate page. */
export type GeoConfirm = {
  confirmed: boolean;
  artifact: string | null;
};

export type GeoConfirmFn = (
  signal: GeoSignalId,
  page: GeoPageInput,
  entityName: string,
) => Promise<GeoConfirm>;

/** Per-signal verdict after gating + confirming. */
export type GeoSignalResult = {
  signal: GeoSignalId;
  weight: number;
  present: boolean;
  artifacts: string[];
  pages: string[];
  recommendation: string | null;
};

export type SiteGeoAuditResult = {
  score: number;
  tier: Tier;
  signals: GeoSignalResult[];
  metadata: { pagesScanned: number; candidates: number; confirmCalls: number };
};
