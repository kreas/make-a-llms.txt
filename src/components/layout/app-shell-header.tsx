'use client';

import { createContext, useContext } from 'react';

/**
 * Lets a page render a full-width header in the AppShell that spans both the
 * content area and the right-rail column (e.g. the site-detail page header).
 * Works the same way as AppShellRail: the page activates the slot via
 * `setActive`, then portals its header content into `mount`.
 */
export type AppShellHeader = {
  mount: HTMLElement | null;
  setActive: (active: boolean) => void;
};

const AppShellHeaderContext = createContext<AppShellHeader | null>(null);

export const AppShellHeaderProvider = AppShellHeaderContext.Provider;

export function useAppShellHeader(): AppShellHeader {
  return useContext(AppShellHeaderContext) ?? { mount: null, setActive: () => {} };
}
