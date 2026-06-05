'use client';

import { useEffect, useMemo, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { AppSidebar } from './app-sidebar';
import { AppShellRailProvider } from './app-shell-rail';

export function AppShell({ userEmail, children }: { userEmail: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [railActive, setRailActive] = useState(false);
  const [railMount, setRailMount] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const rail = useMemo(() => ({ mount: railMount, setActive: setRailActive }), [railMount]);

  return (
    <AppShellRailProvider value={rail}>
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
        <main className="relative w-full flex-1 px-6 pb-10 pt-4 md:px-8">{children}</main>
      </div>

      {/* Right rail column (e.g. the project pages tree) — only when a page registers it.
          Full window height + resize-safe via sticky h-screen, symmetric to the menu sidebar. */}
      {railActive && (
        <aside className="hidden w-[360px] shrink-0 lg:block">
          <div ref={setRailMount} className="sticky top-0 h-screen overflow-hidden" />
        </aside>
      )}
    </div>
    </AppShellRailProvider>
  );
}
