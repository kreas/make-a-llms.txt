import type { SiteTask } from '@/db/schema';

export type TaskSourceKey = Pick<SiteTask, 'sourceType' | 'sourceId' | 'pageUrl'>;

/** Stable identity for a finding. NUL separator cannot appear in the parts. */
export function taskKey(t: TaskSourceKey): string {
  return [t.sourceType, t.sourceId, t.pageUrl].join('\u0000');
}

type CitationResultsLike = { checks: { id: string; passed: boolean }[] };

export function citationPassedKeys(pageUrl: string, results: CitationResultsLike): string[] {
  return results.checks
    .filter((c) => c.passed)
    .map((c) => taskKey({ sourceType: 'citation-check', sourceId: c.id, pageUrl }));
}

type GeoResultsLike = { signals: { signal: string; present: boolean }[] };

export function geoPassedKeys(results: GeoResultsLike): string[] {
  return results.signals
    .filter((s) => s.present)
    .map((s) => taskKey({ sourceType: 'geo-signal', sourceId: s.signal, pageUrl: '' }));
}

type ReconcilableTask = Pick<SiteTask, 'uid' | 'status' | 'sourceType' | 'sourceId' | 'pageUrl'>;

/** Open/done tasks whose source check now passes. wont_do is never touched. */
export function findVerifiableUids(tasks: ReconcilableTask[], passedKeys: Set<string>): string[] {
  return tasks
    .filter((t) => (t.status === 'open' || t.status === 'done') && passedKeys.has(taskKey(t)))
    .map((t) => t.uid);
}
