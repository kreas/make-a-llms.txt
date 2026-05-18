'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { UserMenu } from '@/components/auth/user-menu';
import { Button } from '@/components/ui/button';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/settings/api-tokens', label: 'API Tokens' },
  { href: '/docs', label: 'Docs' },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-hairline bg-canvas">
      <div className="mx-auto flex h-[71px] w-full max-w-[1200px] items-center justify-between px-6">
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
            {NAV_ITEMS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="text-sm text-body transition-colors duration-200 hover:text-primary"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Button
            asChild
            size="icon"
            aria-label="New project"
            className="transition-transform duration-300 hover:scale-110 [&_svg]:transition-transform [&_svg]:duration-500 hover:[&_svg]:rotate-180"
          >
            <Link href="/sites/new">
              <Plus />
              <span className="sr-only">New project</span>
            </Link>
          </Button>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
