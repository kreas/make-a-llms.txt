'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const EXPIRY_OPTIONS = [
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '365 days', days: 365 },
  { label: 'Never', days: null },
] as const;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
};

export function CreateTokenDialog({ open, onOpenChange, onCreated }: Props) {
  const [name, setName] = useState('');
  const [days, setDays] = useState<number | null>(90);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setDays(90);
      setCreatedToken(null);
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  const handleCreate = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch('/api/api-tokens', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, expiresInDays: days ?? undefined }),
      });
      if (!r.ok) {
        setError('Could not create token. Please try again.');
        return;
      }
      const body = await r.json();
      setCreatedToken(body.token);
      onCreated();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {createdToken ? (
          <div>
            <DialogHeader>
              <DialogTitle>Token created</DialogTitle>
              <DialogDescription>
                Copy this now — you won&apos;t see it again.
              </DialogDescription>
            </DialogHeader>
            <pre className="mt-4 overflow-x-auto rounded bg-canvas-soft p-3 font-mono text-sm">
              {createdToken}
            </pre>
            <div className="mt-6 flex justify-end">
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <div>
            <DialogHeader>
              <DialogTitle>New API token</DialogTitle>
            </DialogHeader>
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
            {error ? (
              <p className="mt-4 text-sm text-destructive">{error}</p>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!name || submitting}>
                Create
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
