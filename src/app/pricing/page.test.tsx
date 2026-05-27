import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PricingButton } from './pricing-button';
import { withQueryClient } from '@/test/utils';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

describe('PricingButton', () => {
  beforeEach(() => {
    push.mockReset();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ url: 'https://checkout.stripe.com/test' }),
      }),
    );
  });

  it('redirects to signup when user is logged out and clicks Pro', async () => {
    render(
      withQueryClient(
        <PricingButton
          userId={null}
          isPro={false}
          hasStripeCustomerId={false}
          tier="pro"
        />
      )
    );

    const btn = screen.getByRole('button', { name: /get started with pro/i });
    await userEvent.click(btn);

    expect(push).toHaveBeenCalledWith('/signup?redirect=/pricing');
  });

  it('calls checkout endpoint when user is logged in but not Pro', async () => {
    render(
      withQueryClient(
        <PricingButton
          userId={1}
          isPro={false}
          hasStripeCustomerId={false}
          tier="pro"
        />
      )
    );

    const btn = screen.getByRole('button', { name: /upgrade to pro/i });
    await userEvent.click(btn);

    expect(fetch).toHaveBeenCalledWith('/api/stripe/checkout', { method: 'POST' });
  });

  it('calls portal endpoint when user is logged in and is Pro', async () => {
    render(
      withQueryClient(
        <PricingButton
          userId={1}
          isPro={true}
          hasStripeCustomerId={true}
          tier="pro"
        />
      )
    );

    const btn = screen.getByRole('button', { name: /manage subscription/i });
    await userEvent.click(btn);

    expect(fetch).toHaveBeenCalledWith('/api/stripe/portal', { method: 'POST' });
  });

  it('redirects to dashboard when user is logged in and clicks Free tier', async () => {
    render(
      withQueryClient(
        <PricingButton
          userId={1}
          isPro={false}
          hasStripeCustomerId={false}
          tier="free"
        />
      )
    );

    const btn = screen.getByRole('button', { name: /go to dashboard/i });
    await userEvent.click(btn);

    expect(push).toHaveBeenCalledWith('/dashboard');
  });
});
