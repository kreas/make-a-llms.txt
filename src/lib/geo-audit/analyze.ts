import { gatePage } from './gates';
import { scoreGeoSignals } from './score';
import {
  GEO_SIGNALS,
  GEO_SIGNAL_WEIGHTS,
  type GeoConfirmFn,
  type GeoPageInput,
  type GeoSignalId,
  type GeoSignalResult,
  type SiteGeoAuditResult,
} from './types';

const CANDIDATE_CAP = 5;

const RECOMMENDATIONS: Record<GeoSignalId, string> = {
  pricing:
    'Publish a public pricing or plans page. AI cannot recommend you on value if it cannot see what you cost.',
  comparison:
    'Publish a "You vs [competitor]" or "alternatives to" page so AI has a sourced answer when buyers compare named rivals.',
  'case-study':
    'Publish a customer case study with a concrete outcome metric (a real %, multiple, time saved, or dollar figure).',
};

export async function analyzeGeoPages(
  pages: GeoPageInput[],
  entityName: string,
  confirm: GeoConfirmFn,
): Promise<SiteGeoAuditResult> {
  const candidatesBySignal: Record<GeoSignalId, GeoPageInput[]> = {
    pricing: [],
    comparison: [],
    'case-study': [],
  };
  for (const page of pages) {
    for (const match of gatePage(page)) {
      candidatesBySignal[match.signal].push(page);
    }
  }

  let candidates = 0;
  let confirmCalls = 0;
  const signals: GeoSignalResult[] = [];

  for (const signal of GEO_SIGNALS) {
    const pool = candidatesBySignal[signal].slice(0, CANDIDATE_CAP);
    candidates += pool.length;
    const artifacts: string[] = [];
    const confirmedPages: string[] = [];
    for (const page of pool) {
      confirmCalls += 1;
      const res = await confirm(signal, page, entityName);
      if (res.confirmed) {
        confirmedPages.push(page.url);
        if (res.artifact) artifacts.push(res.artifact);
      }
    }
    const present = confirmedPages.length > 0;
    signals.push({
      signal,
      weight: GEO_SIGNAL_WEIGHTS[signal],
      present,
      artifacts,
      pages: confirmedPages,
      recommendation: present ? null : RECOMMENDATIONS[signal],
    });
  }

  const { score, tier } = scoreGeoSignals(signals);
  return { score, tier, signals, metadata: { pagesScanned: pages.length, candidates, confirmCalls } };
}
