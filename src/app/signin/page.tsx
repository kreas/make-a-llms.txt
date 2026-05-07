'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OtpForm } from '@/components/auth/otp-form';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<'form' | 'otp'>('form');

  const request = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Sign in failed');
      }
    },
    onSuccess: () => setStage('otp'),
  });

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-20">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="display-sm font-normal">Sign in</CardTitle>
          <CardDescription className="text-body">
            {stage === 'form'
              ? 'Enter your email to receive a code.'
              : 'Enter the code we just sent.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stage === 'form' ? (
            <form
              className="flex flex-col gap-5"
              onSubmit={(e) => {
                e.preventDefault();
                request.mutate();
              }}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>
              {request.error ? (
                <p className="text-sm text-destructive">{request.error.message}</p>
              ) : null}
              <Button type="submit" disabled={request.isPending}>
                {request.isPending ? 'Sending…' : 'Send code'}
              </Button>
            </form>
          ) : (
            <OtpForm email={email} onBack={() => setStage('form')} />
          )}
        </CardContent>
        <CardFooter className="text-sm text-muted-foreground">
          New here?
          <Link href="/signup" className="ml-1 text-ink hover:underline">
            Create an account
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
