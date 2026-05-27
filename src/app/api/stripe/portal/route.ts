import { stripe } from '@/lib/stripe';
import { ApiError, apiErrorResponse, requireUserOrThrow } from '@/lib/auth-guards';

export async function POST() {
  try {
    const user = await requireUserOrThrow();

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      if (process.env.NODE_ENV === 'development') {
        console.info('[Stripe Mock] Redirecting to mock billing portal since Stripe is not configured.');
        return Response.json({ url: '/dashboard?checkout=mock_portal' });
      }
      throw new ApiError(500, 'config_error', 'Stripe secret key is not configured');
    }

    if (!user.stripeCustomerId) {
      throw new ApiError(
        400,
        'missing_customer',
        'Stripe customer record not found. Please upgrade to Pro first.'
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${process.env.PUBLIC_BASE_URL || 'http://localhost:4242'}/dashboard`,
    });

    return Response.json({ url: session.url });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
