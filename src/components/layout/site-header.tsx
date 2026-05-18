'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/sites/new', label: 'Add Site' },
  { href: '/documentation', label: 'Documentation' },
  { href: '/settings/api-tokens', label: 'API Tokens' },
  { href: '/docs', label: 'API Docs' },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-hairline bg-canvas">
      <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-6 py-5">
        <div className="flex items-center gap-8">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-ink"
          >
            <Image
              src="/logo.webp"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 shrink-0 rounded-md"
              priority
            />
            <span className="display-sm">AI Ready</span>
          </Link>
          <nav className="hidden gap-8 md:flex">
            {NAV_ITEMS.map(({ href, label }) => {
              const active =
                pathname === href ||
                (href !== '/dashboard' && pathname.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'text-sm transition-colors duration-200',
                    active
                      ? 'border-b-2 border-primary pb-1 text-primary'
                      : 'text-body hover:text-primary',
                  )}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <SignOutButton />
          <Button asChild>
            <Link href="/sites/new">New Project</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
