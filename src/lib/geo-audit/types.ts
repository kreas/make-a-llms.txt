import type { Tier } from '@/lib/citation-audit/types';

export type SiteType = 'saas' | 'ecommerce' | 'local' | 'publisher' | 'services' | 'other';
export type Goal = 'get-cited' | 'win-comparisons' | 'build-trust';
export type SignalTag = 'proof' | 'comparison' | 'evidence' | 'trust' | 'value';

export type GeoPageInput = {
  url: string;
  path: string;
  markdown: string;
};

/** A heuristic gate firing: this page is a candidate for one signal. */
export type GateMatch = {
  signalId: string;
  url: string;
  path: string;
  reason: string;
};

/** LLM confirm output for one candidate page. */
export type GeoConfirm = {
  confirmed: boolean;
  artifact: string | null;
};

/** A self-contained, registered signal definition. */
export type GeoSignalDef = {
  id: string;
  label: string;
  tags: SignalTag[];
  defaultWeight: number;
  /** URL globs handed to the crawl's includePatterns. */
  urlPatterns: string[];
  /** Cheap per-page heuristic over crawled markdown → candidate or null. */
  gate: (page: GeoPageInput) => GateMatch | null;
  /** LLM confirm system prompt for this signal. */
  confirmPrompt: (entityName: string) => string;
  /** Shown when the signal is absent. */
  recommendation: string;
};

export type GeoConfirmFn = (
  signalId: string,
  page: GeoPageInput,
  entityName: string,
) => Promise<GeoConfirm>;

/** Per-signal verdict after gating + confirming. */
export type GeoSignalResult = {
  signal: string;          // signal id
  label: string;
  tags: SignalTag[];
  weight: number;          // effective (goal-adjusted) weight used in scoring
  present: boolean;
  artifacts: string[];
  pages: string[];
  recommendation: string | null;
};

export type SiteGeoAuditResult = {
  siteType: SiteType;
  goal: Goal;
  score: number;
  tier: Tier;
  signals: GeoSignalResult[];
  metadata: { pagesScanned: number; candidates: number; confirmCalls: number };
};
