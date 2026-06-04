'use client';

import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { AppSidebar } from './app-sidebar';

export function AppShell({ userEmail, children }: { userEmail: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="flex min-h-screen bg-canvas text-ink">
      {/* Desktop sidebar */}
      <aside className="hidden w-[228px] shrink-0 border-r border-hairline md:block">
        <div className="sticky top-0 h-screen">
          <AppSidebar userEmail={userEmail} />
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[228px] border-r border-hairline">
            <AppSidebar userEmail={userEmail} />
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="absolute right-2 top-2 rounded-md p-1 text-body hover:bg-surface-card"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center gap-3 border-b border-hairline px-4 md:hidden">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
            className="rounded-md p-1.5 text-body hover:bg-surface-card"
          >
            <Menu className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-v4.png" alt="" aria-hidden className="h-6 w-6 rounded" />
        </div>
        <main className="relative mx-auto w-full max-w-[1100px] flex-1 px-6 py-10">{children}</main>
      </div>
    </div>
  );
}
