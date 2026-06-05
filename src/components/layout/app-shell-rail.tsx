'use client';

import { createContext, useContext } from 'react';

/**
 * Lets a page render a full-height right-rail column in the AppShell (e.g. the project
 * pages tree). The page registers it wants the rail via `setActive`, then portals its
 * content into `mount` (React portals preserve context, so the portaled content keeps
 * the page's providers even though its DOM lands in the shell).
 */
export type AppShellRail = {
  mount: HTMLElement | null;
  setActive: (active: boolean) => void;
};

const AppShellRailContext = createContext<AppShellRail | null>(null);

export const AppShellRailProvider = AppShellRailContext.Provider;

export function useAppShellRail(): AppShellRail {
  return useContext(AppShellRailContext) ?? { mount: null, setActive: () => {} };
}
