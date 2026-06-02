'use client';

import Link from 'next/link';
import { Plus } from 'lucide-react';
import { UserMenu } from '@/components/auth/user-menu';
import { Button } from '@/components/ui/button';
import NavBar, { IMenu } from '@/components/ui/navbar';

interface SiteHeaderProps {
  authenticated?: boolean;
}

export function SiteHeader({ authenticated = true }: SiteHeaderProps) {
  const menus: IMenu[] = authenticated
    ? [
        { id: 1, title: 'Dashboard', url: '/dashboard' },
        { id: 2, title: 'Pricing', url: '/pricing' },
        { id: 3, title: 'Blog', url: '/blog' },
        { id: 4, title: 'Docs', url: '/docs' },
      ]
    : [
        { id: 2, title: 'Pricing', url: '/pricing' },
        { id: 3, title: 'Blog', url: '/blog' },
        { id: 4, title: 'Docs', url: '/docs' },
      ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-hairline bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-6">
        {/* Left side: Logo Icon + Navigation links with dropdowns */}
        <div className="flex items-center gap-8">
          <Link
            href="/"
            title="Home"
            aria-label="Home"
            className="flex items-center text-ink"
          >
            <img
              src="/logo-v4.png"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 shrink-0 rounded-md"
              aria-hidden="true"
            />
            <span className="sr-only">Home</span>
          </Link>
          <nav className="hidden md:flex">
            <NavBar list={menus} />
          </nav>
        </div>

        {/* Right side: Action Buttons */}
        <div className="flex items-center gap-3">
          {authenticated ? (
            <>
              <UserMenu />
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
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/signin">Sign In</Link>
              </Button>
              <Button asChild>
                <Link href="/signup">Sign Up</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

