'use client';

import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';

export function SignOutButton() {
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
    <Button variant="outline" onClick={() => signOut.mutate()} disabled={signOut.isPending}>
      {signOut.isPending ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}
