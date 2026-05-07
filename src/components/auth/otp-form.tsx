'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@/components/ui/input-otp';

type Props = {
  email: string;
  onBack: () => void;
};

export function OtpForm({ email, onBack }: Props) {
  const router = useRouter();
  const [code, setCode] = useState('');

  const verify = useMutation({
    mutationFn: async (otp: string) => {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, code: otp }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Verification failed');
      }
    },
    onSuccess: () => {
      router.push('/');
      router.refresh();
    },
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length === 6) verify.mutate(code);
      }}
    >
      <p className="text-sm text-muted-foreground">
        We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>.
      </p>
      <InputOTP
        maxLength={6}
        value={code}
        onChange={setCode}
        autoFocus
        disabled={verify.isPending}
        containerClassName="justify-center"
      >
        <InputOTPGroup>
          <InputOTPSlot index={0} />
          <InputOTPSlot index={1} />
          <InputOTPSlot index={2} />
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          <InputOTPSlot index={3} />
          <InputOTPSlot index={4} />
          <InputOTPSlot index={5} />
        </InputOTPGroup>
      </InputOTP>
      {verify.error ? (
        <p className="text-sm text-destructive">{verify.error.message}</p>
      ) : null}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={verify.isPending}
        >
          Back
        </Button>
        <Button type="submit" disabled={code.length !== 6 || verify.isPending} className="flex-1">
          {verify.isPending ? 'Verifying…' : 'Verify'}
        </Button>
      </div>
    </form>
  );
}
