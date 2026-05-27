import { headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { users } from '@/db/schema';
import { stripe } from '@/lib/stripe';
import type Stripe from 'stripe';

function parseStripeDate(val: unknown): Date {
  if (!val) return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  
  if (typeof val === 'number') {
    return new Date(val * 1000);
  }
  
  const num = Number(val);
  if (!isNaN(num)) {
    return new Date(num * 1000);
  }
  
  const parsedDate = new Date(val as string);
  return isNaN(parsedDate.getTime()) 
    ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) 
    : parsedDate;
}

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature');
  const isMock =
    (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') &&
    headersList.get('x-stripe-mock') === 'true';

  let event: Stripe.Event;

  try {
    if (isMock) {
      console.info('[Stripe Mock Webhook] Bypassing signature verification');
      event = JSON.parse(body);
    } else {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!webhookSecret || !signature) {
        return new Response('Missing stripe signature or webhook secret', { status: 400 });
      }
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Webhook signature verification failed: ${message}`);
    return new Response(`Webhook Error: ${message}`, { status: 400 });
  }

  const db = getDb();
  const eventType = event.type;

  console.info(`[Stripe Webhook] Received event type: ${eventType}`);

  try {
    if (eventType === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.metadata?.userId || session.client_reference_id;

      if (!userId) {
        console.error('No userId found in checkout session metadata');
        return new Response('No userId in metadata', { status: 400 });
      }

      let customerId = session.customer as string;
      const subscriptionId = session.subscription as string;
      let priceId = '';
      let status = 'active';
      let currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days default fallback

      if (isMock) {
        const mockSession = session as any;
        priceId = mockSession.priceId || process.env.STRIPE_PRO_PRICE_ID || 'price_mock_pro';
        status = mockSession.status || 'active';
        if (mockSession.currentPeriodEnd) {
          currentPeriodEnd = new Date(mockSession.currentPeriodEnd);
        }
      } else {
        // Retrieve actual subscription details
        if (subscriptionId) {
          const sub = (await stripe.subscriptions.retrieve(subscriptionId)) as Stripe.Subscription;
          console.info('[Stripe Webhook DEBUG] sub.current_period_end:', (sub as any).current_period_end, 'sub.currentPeriodEnd:', (sub as any).currentPeriodEnd);
          priceId = sub.items.data[0]?.price.id || '';
          status = sub.status;
          currentPeriodEnd = parseStripeDate((sub as any).currentPeriodEnd || (sub as any).current_period_end);
          customerId = sub.customer as string;
        }
      }

      console.info(`[Stripe Webhook] Upgrading user ${userId} to Pro. Customer: ${customerId}, Sub: ${subscriptionId}`);

      await db
        .update(users)
        .set({
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          stripePriceId: priceId,
          subscriptionStatus: status,
          stripeCurrentPeriodEnd: currentPeriodEnd,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(users.id, Number(userId)));

    } else if (eventType === 'customer.subscription.updated') {
      const sub = event.data.object;
      const subscriptionId = sub.id;

      let priceId = '';
      let status = sub.status;
      let currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      if (isMock) {
        const mockSub = sub as any;
        priceId = mockSub.priceId || process.env.STRIPE_PRO_PRICE_ID || 'price_mock_pro';
        status = mockSub.status || 'active';
        if (mockSub.currentPeriodEnd) {
          currentPeriodEnd = new Date(mockSub.currentPeriodEnd);
        }
      } else {
        priceId = sub.items.data[0]?.price.id || '';
        status = sub.status;
        currentPeriodEnd = parseStripeDate((sub as any).currentPeriodEnd || (sub as any).current_period_end);
      }

      console.info(`[Stripe Webhook] Updating subscription ${subscriptionId} status to: ${status}`);

      await db
        .update(users)
        .set({
          stripePriceId: priceId,
          subscriptionStatus: status,
          stripeCurrentPeriodEnd: currentPeriodEnd,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(users.stripeSubscriptionId, subscriptionId));

    } else if (eventType === 'customer.subscription.deleted') {
      const sub = event.data.object;
      const subscriptionId = sub.id;

      console.info(`[Stripe Webhook] Subscription deleted / cancelled: ${subscriptionId}`);

      await db
        .update(users)
        .set({
          subscriptionStatus: 'canceled',
          stripePriceId: null,
          stripeCurrentPeriodEnd: new Date(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(users.stripeSubscriptionId, subscriptionId));
    }

    return Response.json({ received: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Database update failed for webhook event ${eventType}: ${message}`);
    return new Response(`Database Error: ${message}`, { status: 500 });
  }
}
