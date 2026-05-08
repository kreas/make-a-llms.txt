'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSiteSchema } from '@/lib/validators';

export type SiteFormValues = {
  name: string;
  rootUrl: string;
  sitemapUrl?: string;
};

export function SiteForm({ onSubmit }: { onSubmit: (v: SiteFormValues) => void }) {
  const [name, setName] = useState('');
  const [rootUrl, setRootUrl] = useState('');
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

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
        <Label htmlFor="sitemapUrl">Sitemap URL (optional)</Label>
        <Input
          id="sitemapUrl"
          value={sitemapUrl}
          onChange={(e) => setSitemapUrl(e.target.value)}
          placeholder="https://example.com/sitemap.xml"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit">Create site</Button>
    </form>
  );
}
