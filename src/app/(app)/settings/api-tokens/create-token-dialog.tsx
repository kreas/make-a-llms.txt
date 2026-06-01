'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Mount a fresh form each time the dialog opens so state resets automatically. */}
        {open && (
          <CreateTokenForm
            onClose={() => onOpenChange(false)}
            onCreated={onCreated}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CreateTokenForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [days, setDays] = useState<number | null>(90);
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!createdToken) return;
    await navigator.clipboard.writeText(createdToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

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
      const body = await r.json() as { token: string };
      setCreatedToken(body.token);
      onCreated();
    } finally {
      setSubmitting(false);
    }
  };

  if (createdToken) {
    return (
      <div>
        <DialogHeader>
          <DialogTitle>Token created</DialogTitle>
          <DialogDescription>
            Copy this now — you won&apos;t see it again.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex min-w-0 items-center gap-2 rounded-md border border-hairline bg-canvas-soft p-3">
          <code className="min-w-0 flex-1 overflow-x-auto font-mono text-sm text-ink">
            {createdToken}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            aria-label="Copy API token"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>
        <div className="mt-6 flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </div>
    );
  }

  return (
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
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={handleCreate} disabled={!name || submitting}>Create</Button>
      </div>
    </div>
  );
}
