import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('STRIPE_SECRET_KEY is missing. Stripe integrations will fail unless mocked.');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'mock_stripe_key', {
  typescript: true,
});
