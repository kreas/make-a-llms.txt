'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/sites/new', label: 'Add Site' },
  { href: '/documentation', label: 'Documentation' },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="w-full border-b border-hairline bg-canvas">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="text-lg font-semibold text-ink">
            llms.txt Generator
          </Link>
          <nav className="hidden h-16 items-center gap-6 md:flex">
            {NAV_ITEMS.map(({ href, label }) => {
              const active =
                pathname === href ||
                (href !== '/dashboard' && pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex h-full items-center text-sm transition-colors',
                    active
                      ? 'border-b-2 border-primary text-primary'
                      : 'text-muted-soft hover:text-ink',
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <SignOutButton />
          <Link
            href="/sites/new"
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-canvas transition-colors hover:bg-primary-active"
          >
            New Project
          </Link>
        </div>
      </div>
    </header>
  );
}
