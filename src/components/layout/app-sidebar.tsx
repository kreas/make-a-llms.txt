'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, Globe, History, Bell, Settings, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserMenu } from '@/components/auth/user-menu';

type NavItem = { label: string; href: string; icon: React.ComponentType<{ className?: string }> };

const PRIMARY: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutGrid },
  { label: 'Websites', href: '/dashboard', icon: Globe },
];
const SOON: { label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { label: 'Audit History', icon: History },
  { label: 'Alerts', icon: Bell },
];
const ACCOUNT: NavItem[] = [
  { label: 'Settings', href: '/settings/api-tokens', icon: Settings },
  { label: 'Docs', href: '/docs', icon: BookOpen },
];

export function AppSidebar({ userEmail }: { userEmail: string }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full w-full flex-col gap-6 bg-canvas-soft p-4">
      <Link href="/dashboard" className="flex items-center gap-2.5 px-2 py-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-v4.png" alt="" aria-hidden className="h-7 w-7 rounded-md" />
        <span className="text-sm font-semibold tracking-tight text-ink">AI Readiness</span>
      </Link>

      <nav className="flex flex-col gap-1">
        {PRIMARY.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                active ? 'bg-surface-strong font-medium text-ink' : 'text-body hover:bg-surface-card',
              )}
            >
              <Icon className="h-4 w-4 opacity-70" />
              {item.label}
            </Link>
          );
        })}
        {SOON.map(({ label, icon: Icon }) => (
          <div
            key={label}
            aria-disabled
            className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-soft"
          >
            <Icon className="h-4 w-4 opacity-50" />
            {label}
            <span className="ml-auto rounded-full border border-hairline bg-surface-card px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-muted">
              soon
            </span>
          </div>
        ))}
      </nav>

      <nav className="flex flex-col gap-1">
        <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-soft">Account</p>
        {ACCOUNT.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                active ? 'bg-surface-strong font-medium text-ink' : 'text-body hover:bg-surface-card',
              )}
            >
              <Icon className="h-4 w-4 opacity-70" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex items-center gap-2.5 rounded-lg border border-hairline bg-surface-card px-2.5 py-2">
        <UserMenu />
        <span className="truncate text-xs text-ink">{userEmail}</span>
      </div>
    </div>
  );
}
