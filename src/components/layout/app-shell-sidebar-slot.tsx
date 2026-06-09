'use client';

import { createContext, useContext } from 'react';

/**
 * Lets a page inject site-specific nav into the AppShell sidebar (replacing the
 * generic "Websites" item with the actual site name + sub-links). Works the same
 * way as AppShellRail and AppShellHeader: the page calls `setActive`, then
 * portals its nav content into `mount`.
 */
export type AppShellSidebarSlot = {
  mount: HTMLElement | null;
  active: boolean;
  setActive: (active: boolean) => void;
};

const AppShellSidebarSlotContext = createContext<AppShellSidebarSlot>({
  mount: null,
  active: false,
  setActive: () => {},
});

export const AppShellSidebarSlotProvider = AppShellSidebarSlotContext.Provider;

export function useAppShellSidebarSlot(): AppShellSidebarSlot {
  return useContext(AppShellSidebarSlotContext);
}
