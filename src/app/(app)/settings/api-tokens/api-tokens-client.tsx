'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { CreateTokenDialog } from './create-token-dialog';

type TokenRow = {
  id: number;
  name: string;
  tokenPrefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export function ApiTokensClient() {
  const [creating, setCreating] = useState(false);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const qc = useQueryClient();

  const tokensQuery = useQuery({
    queryKey: ['api-tokens'],
    queryFn: async () => {
      const r = await fetch('/api/api-tokens');
      if (!r.ok) throw new Error('failed');
      return (await r.json()) as { tokens: TokenRow[] };
    },
  });

  const revoke = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/api-tokens/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('failed');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-tokens'] }),
  });

  const tokens = tokensQuery.data?.tokens ?? [];

  return (
    <section className="rounded-lg border border-hairline bg-surface-card p-8">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Tokens</h2>
        <Button onClick={() => setCreating(true)}>New token</Button>
      </div>
      {tokens.length === 0 ? (
        <p className="mt-4 text-sm text-muted-strong">No tokens yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-hairline">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center justify-between py-3">
              <div>
                <div className="text-ink">{t.name}</div>
                <div className="font-mono text-xs text-muted-strong">{t.tokenPrefix}…</div>
              </div>
              {t.revokedAt ? (
                <span className="text-xs text-muted-strong">Revoked</span>
              ) : confirmingId === t.id ? (
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setConfirmingId(null)}>Cancel</Button>
                  <Button
                    onClick={() => {
                      revoke.mutate(t.id);
                      setConfirmingId(null);
                    }}
                  >
                    Confirm
                  </Button>
                </div>
              ) : (
                <Button variant="ghost" onClick={() => setConfirmingId(t.id)}>Revoke</Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <CreateTokenDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => qc.invalidateQueries({ queryKey: ['api-tokens'] })}
      />
    </section>
  );
}
