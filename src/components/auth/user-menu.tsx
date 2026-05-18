'use client';

import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { User } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export function UserMenu() {
  const router = useRouter();
  const signOut = useMutation({
    mutationFn: async () => {
      await fetch('/api/auth/signout', { method: 'POST' });
    },
    onSuccess: () => {
      router.push('/signin');
      router.refresh();
    },
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Open user menu"
        className={cn(
          'inline-flex h-10 w-10 items-center justify-center rounded-full border border-hairline text-body transition-colors',
          'hover:border-hairline-strong hover:text-ink',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        )}
      >
        <User className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            signOut.mutate();
          }}
          disabled={signOut.isPending}
        >
          {signOut.isPending ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
