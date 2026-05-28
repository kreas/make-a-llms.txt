'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus } from 'lucide-react';
import { UserMenu } from '@/components/auth/user-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SiteHeaderProps {
  authenticated?: boolean;
}

export function SiteHeader({ authenticated = true }: SiteHeaderProps) {
  const pathname = usePathname();

  const navItems = authenticated
    ? [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/pricing', label: 'Pricing' },
        { href: '/blog', label: 'Blog' },
        { href: '/docs', label: 'Docs' },
      ]
    : [
        { href: '/pricing', label: 'Pricing' },
        { href: '/blog', label: 'Blog' },
        { href: '/docs', label: 'Docs' },
      ];

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-hairline bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex items-center gap-2 text-ink"
          >
            <img
              src="/logo-v4.png"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 shrink-0 rounded-md"
            />
            <span className="display-sm">AI Ready</span>
          </Link>
          <nav className="hidden gap-8 md:flex">
            {navItems.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'text-sm transition-colors duration-200',
                  isActive(href)
                    ? 'font-medium text-primary'
                    : 'text-body hover:text-primary'
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
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

