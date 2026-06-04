'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';

export function AuditUrlStrip() {
  const router = useRouter();
  const [url, setUrl] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    router.push(`/sites/new?url=${encodeURIComponent(trimmed)}`);
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-hairline bg-canvas-soft p-4">
      <p className="mb-2.5 flex items-center gap-2 text-[13px] text-body">
        <Sparkles className="h-4 w-4 text-primary" aria-hidden /> Audit a new URL for AI readiness
      </p>
      <div className="flex h-11 items-center gap-2 rounded-lg border border-hairline-strong bg-surface-card pl-3.5 pr-1.5">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://yoursite.com"
          aria-label="Website URL to audit"
          className="h-full flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted-soft"
        />
        <button
          type="submit"
          className="rounded-md bg-ink px-3.5 py-1.5 text-[13px] font-medium text-canvas transition-colors hover:opacity-90"
        >
          Audit
        </button>
      </div>
    </form>
  );
}
