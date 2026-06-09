'use client';

import { useEffect, useMemo, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { AppSidebar } from './app-sidebar';
import { AppShellRailProvider } from './app-shell-rail';
import { AppShellHeaderProvider } from './app-shell-header';
import { AppShellSidebarSlotProvider } from './app-shell-sidebar-slot';

export function AppShell({ userEmail, children }: { userEmail: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [railActive, setRailActive] = useState(false);
  const [railMount, setRailMount] = useState<HTMLElement | null>(null);
  const [headerActive, setHeaderActive] = useState(false);
  const [headerMount, setHeaderMount] = useState<HTMLElement | null>(null);
  const [sidebarSlotActive, setSidebarSlotActive] = useState(false);
  const [sidebarSlotMount, setSidebarSlotMount] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const rail = useMemo(() => ({ mount: railMount, setActive: setRailActive }), [railMount]);
  const header = useMemo(() => ({ mount: headerMount, setActive: setHeaderActive }), [headerMount]);
  const sidebarSlot = useMemo(
    () => ({ mount: sidebarSlotMount, active: sidebarSlotActive, setActive: setSidebarSlotActive }),
    [sidebarSlotMount, sidebarSlotActive],
  );

  return (
    <AppShellRailProvider value={rail}>
    <AppShellHeaderProvider value={header}>
    <AppShellSidebarSlotProvider value={sidebarSlot}>
    {/*
      h-screen + overflow-hidden: true app-shell layout. The sidebar, content, and
      right-rail all fill the viewport height. Content scrolls inside <main> via
      overflow-y-auto; the rail scrolls inside its own column. This lets the page
      header portal span the full content+rail width above the split.
    */}
    <div className="flex h-screen overflow-hidden bg-canvas text-ink">
      {/* Desktop sidebar */}
      <aside className="hidden w-[228px] shrink-0 border-r border-hairline md:block">
        <AppSidebar userEmail={userEmail} slotRef={setSidebarSlotMount} />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[228px] border-r border-hairline">
            <AppSidebar userEmail={userEmail} slotRef={setSidebarSlotMount} />
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

      {/* Content column — contains optional page header above the content+rail split */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile menu bar */}
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

        {/* Page header portal — spans full content+rail width. Activated + portaled by the page. */}
        {headerActive && <div ref={setHeaderMount} />}

        {/* Content + right rail row — fills remaining height */}
        <div className="flex min-h-0 flex-1">
          <main className="relative min-w-0 flex-1 overflow-y-auto px-6 pb-10 pt-4 md:px-8">
            {children}
          </main>

          {/*
            Right rail column — only when a page registers it via useAppShellRail().
            Symmetric to the sidebar. Rail content portals into the h-full mount div;
            the rail component itself manages its own internal scrolling.
          */}
          {railActive && (
            <aside className="hidden w-[360px] shrink-0 lg:block">
              <div ref={setRailMount} className="h-full" />
            </aside>
          )}
        </div>
      </div>
    </div>
    </AppShellSidebarSlotProvider>
    </AppShellHeaderProvider>
    </AppShellRailProvider>
  );
}
