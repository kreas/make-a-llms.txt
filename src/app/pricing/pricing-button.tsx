'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PricingButtonProps {
  userId: number | null;
  isPro: boolean;
  hasStripeCustomerId: boolean;
  tier: 'free' | 'pro' | 'enterprise';
}

export function PricingButton({
  userId,
  isPro,
  hasStripeCustomerId,
  tier,
}: PricingButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAction = async () => {
    setError(null);

    if (tier === 'enterprise') {
      window.location.href = 'mailto:sales@aiready.cat?subject=Enterprise%20Inquiry';
      return;
    }

    if (!userId) {
      // Redirect to signup with redirect param
      router.push('/signup?redirect=/pricing');
      return;
    }

    if (tier === 'free') {
      router.push('/dashboard');
      return;
    }

    setIsLoading(true);

    try {
      if (isPro && hasStripeCustomerId) {
        // Manage subscription
        const res = await fetch('/api/stripe/portal', { method: 'POST' });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error?.message || 'Failed to open billing portal');
        }
        const data = await res.json();
        window.location.href = data.url;
      } else {
        // Upgrade
        const res = await fetch('/api/stripe/checkout', { method: 'POST' });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error?.message || 'Failed to start checkout');
        }
        const data = await res.json();
        window.location.href = data.url;
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setIsLoading(false);
    }
  };

  if (tier === 'enterprise') {
    return (
      <Button
        variant="outline"
        onClick={handleAction}
        className="w-full h-11 border-hairline-strong text-ink hover:bg-canvas-soft transition-all duration-200"
      >
        Contact Sales
      </Button>
    );
  }

  if (tier === 'free') {
    return (
      <Button
        variant="outline"
        onClick={handleAction}
        className="w-full h-11 border-hairline-strong text-ink hover:bg-canvas-soft transition-all duration-200"
      >
        {userId ? 'Go to Dashboard' : 'Sign Up Free'}
      </Button>
    );
  }

  // Pro plan button style depends on if it's highlighted/featured
  // Let's make it the signature Cursor Orange CTA if not already Pro, or secondary if they already have Pro
  const isCurrentlyPro = tier === 'pro' && isPro;

  return (
    <div className="w-full">
      <Button
        disabled={isLoading}
        onClick={handleAction}
        className={`w-full h-11 transition-all duration-200 font-medium ${
          isCurrentlyPro
            ? 'bg-transparent text-canvas border border-hairline-strong hover:bg-white/10'
            : 'bg-primary text-on-primary hover:bg-primary-active'
        }`}
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isCurrentlyPro ? 'Manage Subscription' : userId ? 'Upgrade to Pro' : 'Get Started with Pro'}
      </Button>
      {error && (
        <p className="mt-2 text-center text-xs text-destructive animate-fade-in">
          {error}
        </p>
      )}
    </div>
  );
}
