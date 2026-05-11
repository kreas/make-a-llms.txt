'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export type SiteFormValues = {
  rootUrl: string;
  sitemapUrl?: string;
};

type DiscoveryStatus = 'idle' | 'discovering' | 'found' | 'not-found' | 'error';

export function SiteForm({ onSubmit }: { onSubmit: (v: SiteFormValues) => void }) {
  const [rootUrl, setRootUrl] = useState('');
  const [discoveredSitemapUrl, setDiscoveredSitemapUrl] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [discoveryStatus, setDiscoveryStatus] = useState<DiscoveryStatus>('idle');

  const autoFilledRef = useRef(false);
  const sitemapValueRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    sitemapValueRef.current = discoveredSitemapUrl;
  }, [discoveredSitemapUrl]);

  // Debounced sitemap discovery
  useEffect(() => {
    const trimmed = rootUrl.trim();

    let shouldDiscover = false;
    if (trimmed) {
      try {
        const u = new URL(trimmed);
        if (/^https?:$/.test(u.protocol)) {
          if (!sitemapValueRef.current || autoFilledRef.current) {
            shouldDiscover = true;
          }
        }
      } catch {
        // invalid URL — skip
      }
    }

    if (!shouldDiscover) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setDiscoveryStatus('discovering');
      try {
        const res = await fetch('/api/sitemap/discover', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ rootUrl: trimmed }),
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (res.ok) {
          const body = (await res.json()) as { sitemapUrl: string };
          autoFilledRef.current = true;
          setDiscoveredSitemapUrl(body.sitemapUrl);
          setDiscoveryStatus('found');
        } else if (res.status === 404) {
          if (autoFilledRef.current) {
            autoFilledRef.current = false;
            setDiscoveredSitemapUrl(undefined);
          }
          setDiscoveryStatus('not-found');
        } else {
          setDiscoveryStatus('error');
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setDiscoveryStatus('error');
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [rootUrl]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = rootUrl.trim();
    if (!trimmed) {
      setError('Please enter a website URL');
      return;
    }
    try {
      const u = new URL(trimmed);
      if (!/^https?:$/.test(u.protocol)) {
        setError('URL must start with http:// or https://');
        return;
      }
    } catch {
      setError('Please enter a valid URL');
      return;
    }
    setError(null);
    onSubmit({ rootUrl: trimmed, sitemapUrl: discoveredSitemapUrl });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="rootUrl">Website URL</Label>
        <Input
          id="rootUrl"
          value={rootUrl}
          onChange={(e) => setRootUrl(e.target.value)}
          placeholder="https://example.com"
          type="text"
        />
        <div className="min-h-[20px]">
          <DiscoveryHint status={discoveryStatus} sitemapUrl={discoveredSitemapUrl} />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full">
        Add &amp; Generate
      </Button>
    </form>
  );
}

function DiscoveryHint({
  status,
  sitemapUrl,
}: {
  status: DiscoveryStatus;
  sitemapUrl?: string;
}) {
  if (status === 'idle') return null;
  if (status === 'discovering') {
    return (
      <span
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-1.5 text-xs text-muted-strong"
      >
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        Looking for sitemap…
      </span>
    );
  }
  if (status === 'found') {
    return (
      <span
        role="status"
        className="inline-flex items-center gap-1.5 text-xs text-semantic-success"
      >
        <Check className="h-3 w-3" aria-hidden />
        Found sitemap{sitemapUrl ? `: ${sitemapUrl}` : ''}
      </span>
    );
  }
  if (status === 'not-found') {
    return (
      <span role="status" className="text-xs text-muted-strong">
        No sitemap found — we&apos;ll still try at run time
      </span>
    );
  }
  return (
    <span role="status" className="text-xs text-muted-strong">
      Couldn&apos;t reach the site
    </span>
  );
}
