'use client';
import { Check, X } from 'lucide-react';
import type { SerializedSiteGeoAudit } from '@/lib/geo-audit/serialize';
import { AddTaskButton } from '@/components/tasks/add-task-button';

type Signal = NonNullable<SerializedSiteGeoAudit['results']>['signals'][number];

function pathOf(url: string): string {
  try { return new URL(url).pathname; } catch { return url; }
}

export function GeoSignalList({ signals, siteUid }: { signals: Signal[]; siteUid: string }) {
  return (
    <ul className="divide-y divide-hairline">
      {signals.map((s) => (
        <li key={s.signal} className="flex gap-3 py-4">
          <span className={`mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full ${s.present ? 'bg-semantic-success/10 text-semantic-success' : 'bg-canvas-soft text-muted-soft'}`}>
            {s.present ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-medium text-ink">{s.label}</p>
              <span className="font-mono text-xs text-muted-soft tabular-nums">{s.weight} pts</span>
            </div>
            <div
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-canvas-soft"
              role="progressbar"
              aria-valuenow={s.present ? s.weight : 0}
              aria-valuemin={0}
              aria-valuemax={s.weight}
              aria-label={s.label}
            >
              <div className="h-full rounded-full bg-semantic-success" style={{ width: s.present ? '100%' : '0%' }} />
            </div>
            {s.present && s.artifacts.length > 0 && (
              <p className="mt-1.5 text-sm text-body">{s.artifacts.join(' · ')}</p>
            )}
            {s.present && s.pages.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                {s.pages.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer" className="text-xs text-muted-strong underline decoration-hairline-strong underline-offset-2 hover:text-ink">
                    {pathOf(url)}
                  </a>
                ))}
              </div>
            )}
            {!s.present && (
              <div className="mt-1.5 flex flex-col gap-2">
                {s.recommendation && (
                  <p className="border-l-2 border-hairline-strong pl-3 text-sm text-body">{s.recommendation}</p>
                )}
                <div>
                  <AddTaskButton
                    siteUid={siteUid}
                    finding={{
                      sourceType: 'geo-signal',
                      sourceId: s.signal,
                      title: s.label,
                      foundText: '',
                      fixText: s.recommendation ?? '',
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
