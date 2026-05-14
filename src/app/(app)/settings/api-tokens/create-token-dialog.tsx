'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

const EXPIRY_OPTIONS = [
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '365 days', days: 365 },
  { label: 'Never', days: null },
] as const;

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export function CreateTokenDialog({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [days, setDays] = useState<number | null>(90);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleCreate = async () => {
    setSubmitting(true);
    try {
      const r = await fetch('/api/api-tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, expiresInDays: days ?? undefined }),
      });
      if (!r.ok) return;
      const body = await r.json();
      setCreatedToken(body.token);
      onCreated();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-hairline bg-surface-card p-6">
        {createdToken ? (
          <div>
            <h3 className="text-lg font-semibold text-ink">Token created</h3>
            <p className="mt-2 text-sm text-muted-strong">
              Copy this now — you won&apos;t see it again.
            </p>
            <pre className="mt-4 overflow-x-auto rounded bg-canvas-soft p-3 font-mono text-sm">
              {createdToken}
            </pre>
            <div className="mt-6 flex justify-end">
              <Button
                onClick={() => {
                  setCreatedToken(null);
                  setName('');
                  onClose();
                }}
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <h3 className="text-lg font-semibold text-ink">New API token</h3>
            <label className="mt-4 block text-sm text-ink">
              Name
              <input
                className="mt-1 w-full rounded border border-hairline bg-canvas px-3 py-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="mt-4 block text-sm text-ink">
              Expires
              <select
                className="mt-1 w-full rounded border border-hairline bg-canvas px-3 py-2"
                value={days ?? ''}
                onChange={(e) => setDays(e.target.value ? Number(e.target.value) : null)}
              >
                {EXPIRY_OPTIONS.map((o) => (
                  <option key={o.label} value={o.days ?? ''}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!name || submitting}>
                Create
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
