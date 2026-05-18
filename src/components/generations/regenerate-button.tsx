'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function RegenerateButton({
  siteId,
  onSubmit,
}: {
  siteId: string;
  onSubmit: (v: { siteId: string; notifyEmail: boolean }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState(false);

  return (
    <div className="relative inline-block">
      <Button onClick={() => setOpen((v) => !v)}>Regenerate</Button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-72 rounded-lg border border-hairline bg-surface-card p-4 shadow-none">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={notifyEmail}
              onChange={(e) => setNotifyEmail(e.target.checked)}
            />
            Email me when done
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onSubmit({ siteId, notifyEmail });
                setOpen(false);
              }}
            >
              Confirm
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
