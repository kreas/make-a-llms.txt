'use client';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { SiteType, Goal } from './use-geo-audit';

const TYPE_LABELS: Record<SiteType, string> = {
  saas: 'B2B SaaS / software',
  publisher: 'Blog / publisher',
  ecommerce: 'Ecommerce / store',
  local: 'Local business',
  services: 'Agency / services',
  other: 'Other',
};

const GOALS: { id: Goal; label: string }[] = [
  { id: 'get-cited', label: 'Get cited by AI' },
  { id: 'build-trust', label: 'Build trust & authority' },
  { id: 'win-comparisons', label: 'Win comparisons' },
];

export function GeoConfirmCard({
  suggestedType,
  confidence,
  onAnalyze,
  isRunning,
}: {
  suggestedType: SiteType;
  confidence: number;
  onAnalyze: (input: { siteType: SiteType; goal: Goal }) => void;
  isRunning: boolean;
}) {
  const lowConfidence = confidence < 0.5;
  const [siteType, setSiteType] = useState<SiteType>(lowConfidence ? 'other' : suggestedType);
  const [goal, setGoal] = useState<Goal>('get-cited');

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 py-8">
      <div className="text-center">
        <Sparkles className="mx-auto mb-2 h-7 w-7 text-muted-soft" aria-hidden="true" />
        <p className="text-lg text-ink">{lowConfidence ? 'Tell us what kind of site this is' : "Here's what we detected"}</p>
      </div>

      <label className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-canvas-soft px-4 py-3 text-sm">
        <span className="text-body">Site type</span>
        <select
          aria-label="Site type"
          value={siteType}
          onChange={(e) => setSiteType(e.target.value as SiteType)}
          className="rounded-md border border-hairline-strong bg-surface-card px-2 py-1 text-sm text-ink"
        >
          {(Object.keys(TYPE_LABELS) as SiteType[]).map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>
      </label>
      {!lowConfidence && (
        <p className="-mt-3 text-center font-mono text-xs text-muted-soft">confidence {confidence.toFixed(2)}</p>
      )}

      <div>
        <p className="mb-2 text-sm font-medium text-ink">What&apos;s your main goal?</p>
        <div className="flex flex-col gap-2">
          {GOALS.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => setGoal(g.id)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${goal === g.id ? 'border-primary bg-primary/5 text-ink' : 'border-hairline text-body hover:bg-canvas-soft'}`}
            >
              <span className={`h-3 w-3 rounded-full border ${goal === g.id ? 'border-primary bg-primary' : 'border-hairline-strong'}`} />
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onAnalyze({ siteType, goal })}
        disabled={isRunning}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {isRunning ? 'Starting…' : 'Analyze →'}
      </button>
    </div>
  );
}
