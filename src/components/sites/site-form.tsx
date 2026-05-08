'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSiteSchema } from '@/lib/validators';

export type SiteFormValues = {
  name: string;
  rootUrl: string;
  sitemapUrl?: string;
};

type DiscoveryStatus = 'idle' | 'discovering' | 'found' | 'not-found' | 'error';

export function SiteForm({ onSubmit }: { onSubmit: (v: SiteFormValues) => void }) {
  const [name, setName] = useState('');
  const [rootUrl, setRootUrl] = useState('');
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [discoveryStatus, setDiscoveryStatus] = useState<DiscoveryStatus>('idle');

  const autoFilledRef = useRef(false);
  const sitemapValueRef = useRef('');
  useEffect(() => {
    sitemapValueRef.current = sitemapUrl;
  }, [sitemapUrl]);

  // Debounced sitemap discovery
  useEffect(() => {
    const trimmed = rootUrl.trim();

    // Determine if we should attempt discovery at all (synchronously, no setState)
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
          setSitemapUrl(body.sitemapUrl);
          setDiscoveryStatus('found');
        } else if (res.status === 404) {
          if (autoFilledRef.current) {
            autoFilledRef.current = false;
            setSitemapUrl('');
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

  function handleSitemapChange(value: string) {
    autoFilledRef.current = false;
    setSitemapUrl(value);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createSiteSchema.safeParse({
      name,
      rootUrl,
      sitemapUrl: sitemapUrl || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }
    setError(null);
    onSubmit({
      name: parsed.data.name,
      rootUrl: parsed.data.rootUrl,
      sitemapUrl: parsed.data.sitemapUrl,
    });
  }

  const discovering = discoveryStatus === 'discovering';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="rootUrl">Website URL</Label>
        <Input
          id="rootUrl"
          value={rootUrl}
          onChange={(e) => setRootUrl(e.target.value)}
          placeholder="https://example.com"
        />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <Label htmlFor="sitemapUrl">Sitemap URL (optional)</Label>
          <DiscoveryHint status={discoveryStatus} />
        </div>
        <Input
          id="sitemapUrl"
          value={sitemapUrl}
          onChange={(e) => handleSitemapChange(e.target.value)}
          placeholder="https://example.com/sitemap.xml"
          disabled={discovering}
          aria-busy={discovering}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit">Create site</Button>
    </form>
  );
}

function DiscoveryHint({ status }: { status: DiscoveryStatus }) {
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
        Found
      </span>
    );
  }
  if (status === 'not-found') {
    return (
      <span role="status" className="text-xs text-muted-strong">
        No sitemap found — you can add one manually
      </span>
    );
  }
  return (
    <span role="status" className="text-xs text-muted-strong">
      Couldn&apos;t reach the site
    </span>
  );
}
