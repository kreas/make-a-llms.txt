import { activeSignalIds } from './profiles';
import { getSignal } from './signals/index';
import { effectiveWeight, scoreActiveSignals } from './score';
import type {
  GeoConfirmFn, GeoPageInput, GeoSignalResult, Goal, SiteGeoAuditResult, SiteType,
} from './types';

const CANDIDATE_CAP = 5;

export async function analyzeGeoPages(
  pages: GeoPageInput[],
  ctx: { entityName: string; siteType: SiteType; goal: Goal },
  confirm: GeoConfirmFn,
): Promise<SiteGeoAuditResult> {
  const ids = activeSignalIds(ctx.siteType);
  let candidates = 0;
  let confirmCalls = 0;
  const signals: GeoSignalResult[] = [];

  for (const id of ids) {
    const sig = getSignal(id);
    if (!sig) continue;
    const gated = pages.filter((p) => sig.gate(p) !== null).slice(0, CANDIDATE_CAP);
    candidates += gated.length;

    const artifacts: string[] = [];
    const confirmedPages: string[] = [];
    for (const page of gated) {
      confirmCalls += 1;
      const res = await confirm(id, page, ctx.entityName);
      if (res.confirmed) {
        confirmedPages.push(page.url);
        if (res.artifact) artifacts.push(res.artifact);
      }
    }
    const present = confirmedPages.length > 0;
    signals.push({
      signal: id,
      label: sig.label,
      tags: sig.tags,
      weight: effectiveWeight(sig, ctx.goal),
      present,
      artifacts,
      pages: confirmedPages,
      recommendation: present ? null : sig.recommendation,
    });
  }

  const { score, tier } = scoreActiveSignals(signals);
  return {
    siteType: ctx.siteType,
    goal: ctx.goal,
    score,
    tier,
    signals,
    metadata: { pagesScanned: pages.length, candidates, confirmCalls },
  };
}
