import { activeSignalIds } from './profiles';
import { getSignal } from './signals/index';
import { effectiveWeight, scoreActiveSignals } from './score';
import type {
  GeoConfirm, GeoConfirmFn, GeoPageInput, GeoSignalDef, GeoSignalResult, Goal, SiteGeoAuditResult, SiteType,
} from './types';

const CANDIDATE_CAP = 5;
const CONFIRM_CONCURRENCY = 6;

/** Run `fn` over `items` with a bounded worker pool; output order matches input. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const idx = next++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

type ConfirmTask = { signalId: string; page: GeoPageInput };
type ConfirmOutcome = ConfirmTask & { res: GeoConfirm; failed: boolean };

const NOT_CONFIRMED: GeoConfirm = { confirmed: false, artifact: null };

export async function analyzeGeoPages(
  pages: GeoPageInput[],
  ctx: { entityName: string; siteType: SiteType; goal: Goal },
  confirm: GeoConfirmFn,
): Promise<SiteGeoAuditResult> {
  const ids = activeSignalIds(ctx.siteType);

  // 1. Gate every page per active signal → a flat list of confirm tasks (capped per signal).
  const activeSignals: GeoSignalDef[] = [];
  const tasks: ConfirmTask[] = [];
  for (const id of ids) {
    const sig = getSignal(id);
    if (!sig) continue;
    activeSignals.push(sig);
    const gated = pages.filter((p) => sig.gate(p) !== null).slice(0, CANDIDATE_CAP);
    for (const page of gated) tasks.push({ signalId: id, page });
  }

  // 2. Confirm all candidates concurrently (bounded). A single confirm failure
  //    (e.g. a transient AI-gateway timeout) must NOT abort the whole audit — it
  //    marks just that candidate unconfirmed. If EVERY call fails (gateway down),
  //    throw so the run is recorded as failed rather than a misleading 0 score.
  const confirmed = await mapWithConcurrency(tasks, CONFIRM_CONCURRENCY, async (t): Promise<ConfirmOutcome> => {
    try {
      const res = await confirm(t.signalId, t.page, ctx.entityName);
      return { ...t, res, failed: false };
    } catch {
      return { ...t, res: NOT_CONFIRMED, failed: true };
    }
  });

  const failedCount = confirmed.reduce((n, c) => n + (c.failed ? 1 : 0), 0);
  if (tasks.length > 0 && failedCount === tasks.length) {
    throw new Error('All candidate checks failed (AI gateway unavailable). Try again.');
  }

  // 3. Assemble per-signal verdicts (in active-set order for stable display).
  const bySignal = new Map<string, { pages: string[]; artifacts: string[] }>();
  for (const { signalId, page, res } of confirmed) {
    let entry = bySignal.get(signalId);
    if (!entry) {
      entry = { pages: [], artifacts: [] };
      bySignal.set(signalId, entry);
    }
    if (res.confirmed) {
      entry.pages.push(page.url);
      if (res.artifact) entry.artifacts.push(res.artifact);
    }
  }

  const signals: GeoSignalResult[] = activeSignals.map((sig) => {
    const entry = bySignal.get(sig.id) ?? { pages: [], artifacts: [] };
    const present = entry.pages.length > 0;
    return {
      signal: sig.id,
      label: sig.label,
      tags: sig.tags,
      weight: effectiveWeight(sig, ctx.goal),
      present,
      artifacts: entry.artifacts,
      pages: entry.pages,
      recommendation: present ? null : sig.recommendation,
    };
  });

  const { score, tier } = scoreActiveSignals(signals);
  return {
    siteType: ctx.siteType,
    goal: ctx.goal,
    score,
    tier,
    signals,
    metadata: { pagesScanned: pages.length, candidates: tasks.length, confirmCalls: tasks.length },
  };
}
