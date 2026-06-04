'use client';

import { useState } from 'react';
import { Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type SiteFormValues = {
  rootUrl: string;
  sitemapUrl?: string;
};

type PreflightResult = {
  ok: boolean;
  homepageReachable: boolean;
  sitemapUrl: string | null;
};

type Phase = 'idle' | 'checking' | 'ready';

/**
 * Two-step project setup form. The user first runs a "Preflight Check" that
 * verifies the homepage is reachable and a sitemap.xml exists. Only once both
 * pass does the button become "Start Project" (and confetti fires via
 * `onPreflightSuccess`). Editing the URL after a passing check resets the flow.
 */
export function SiteForm({
  onSubmit,
  onPreflightSuccess,
  initialUrl = '',
}: {
  onSubmit: (v: SiteFormValues) => void;
  onPreflightSuccess?: (result: PreflightResult) => void;
  initialUrl?: string;
}) {
  const [rootUrl, setRootUrl] = useState(initialUrl);
  const [phase, setPhase] = useState<Phase>('idle');
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Validates and normalizes the input. Returns null (and sets error) on failure. */
  function normalize(): string | null {
    const trimmed = rootUrl.trim();
    if (!trimmed) {
      setError('Please enter a website URL');
      return null;
    }

    // Auto-prepend https:// if no protocol is present
    const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

    try {
      const u = new URL(candidate);
      if (!/^https?:$/.test(u.protocol)) {
        setError('URL must start with http:// or https://');
        return null;
      }
      const host = u.hostname;
      if (host !== 'localhost' && !host.includes('.')) {
        setError('Please enter a valid URL');
        return null;
      }
    } catch {
      setError('Please enter a valid URL');
      return null;
    }

    return candidate;
  }

  async function runPreflight() {
    const normalized = normalize();
    if (!normalized) return;

    setError(null);
    setPreflight(null);
    setPhase('checking');

    try {
      const res = await fetch('/api/sitemap/preflight', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rootUrl: normalized }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? 'Preflight check failed. Please try again.');
        setPhase('idle');
        return;
      }

      const result = (await res.json()) as PreflightResult;
      setRootUrl(normalized);
      setPreflight(result);

      if (result.ok) {
        setPhase('ready');
        onPreflightSuccess?.(result);
      } else {
        setPhase('idle');
      }
    } catch {
      setError("Couldn't run the preflight check. Please try again.");
      setPhase('idle');
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (phase === 'ready' && preflight) {
      onSubmit({ rootUrl, sitemapUrl: preflight.sitemapUrl ?? undefined });
      return;
    }
    void runPreflight();
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setRootUrl(e.target.value);
    setError(null);
    // Any edit invalidates a prior check — the user must re-run preflight.
    if (phase !== 'idle' || preflight) {
      setPhase('idle');
      setPreflight(null);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="rootUrl">Website URL</Label>
        <Input
          id="rootUrl"
          value={rootUrl}
          onChange={handleChange}
          placeholder="https://example.com"
          type="text"
        />
        <div className="min-h-[20px]">
          <PreflightHint phase={phase} result={preflight} />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={phase === 'checking'}>
        {phase === 'checking' && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {phase === 'ready' ? 'Start Project' : 'Preflight Check'}
      </Button>
    </form>
  );
}

function PreflightHint({
  phase,
  result,
}: {
  phase: Phase;
  result: PreflightResult | null;
}) {
  if (phase === 'checking') {
    return (
      <span
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-1.5 text-xs text-muted-strong"
      >
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        Running preflight check…
      </span>
    );
  }

  if (!result) return null;

  if (result.ok) {
    return (
      <span
        role="status"
        className="inline-flex items-center gap-1.5 text-xs text-semantic-success"
      >
        <Check className="h-3 w-3" aria-hidden />
        Site reachable{result.sitemapUrl ? ` — sitemap found at ${result.sitemapUrl}` : ''}
      </span>
    );
  }

  // Failed: explain which check did not pass.
  const message = !result.homepageReachable
    ? "Couldn't reach the homepage — check the URL and try again"
    : 'No sitemap.xml found — add one, then run the check again';

  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-xs text-destructive">
      <X className="h-3 w-3" aria-hidden />
      {message}
    </span>
  );
}
