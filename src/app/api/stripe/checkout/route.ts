import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { ApiError, apiErrorResponse, requireUserOrThrow } from '@/lib/auth-guards';

export async function POST() {
  try {
    const user = await requireUserOrThrow();

    const priceId = process.env.STRIPE_PRO_PRICE_ID;
    const stripeKey = process.env.STRIPE_SECRET_KEY;

    // Fallback for local development if keys are not set
    if (!stripeKey || !priceId) {
      if (process.env.NODE_ENV === 'development') {
        console.info('[Stripe Mock] Redirecting to mock success URL since Stripe is not configured.');
        return Response.json({ url: '/dashboard?checkout=mock_success' });
      }
      throw new ApiError(500, 'config_error', 'Stripe price ID or secret key is not configured');
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.PUBLIC_BASE_URL || 'http://localhost:4242'}/dashboard?checkout=success`,
      cancel_url: `${process.env.PUBLIC_BASE_URL || 'http://localhost:4242'}/pricing?checkout=cancelled`,
      metadata: {
        userId: user.id.toString(),
        userEmail: user.email,
      },
      subscription_data: {
        metadata: {
          userId: user.id.toString(),
          userEmail: user.email,
        },
      },
      customer: user.stripeCustomerId ?? undefined,
      customer_email: user.stripeCustomerId ? undefined : user.email,
    };

    const session = await stripe.checkout.sessions.create(sessionParams);

    return Response.json({ url: session.url });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
