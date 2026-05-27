import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { POST } from './route';

const { mockHeaders } = vi.hoisted(() => {
  return { mockHeaders: new Headers({ 'x-stripe-mock': 'true' }) };
});
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(mockHeaders),
}));

function mockWebhookRequest(body: any): Request {
  return new Request('http://localhost:4242/api/stripe/webhook', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

describe('Stripe Webhook API', () => {
  let testUser: any;

  beforeEach(async () => {
    await setupTestDb();
    const db = getDb();
    // Insert a test user
    const [u] = await db
      .insert(users)
      .values({
        name: 'John Doe',
        email: 'john@example.com',
      })
      .returning();
    testUser = u;
    
    // Set headers mock
    mockHeaders.set('x-stripe-mock', 'true');
  });

  it('upgrades a user on checkout.session.completed', async () => {
    const payload = {
      type: 'checkout.session.completed',
      data: {
        object: {
          customer: 'cus_test123',
          subscription: 'sub_test123',
          priceId: 'price_pro123',
          status: 'active',
          currentPeriodEnd: new Date(Date.now() + 30 * 86400000).toISOString(),
          metadata: {
            userId: testUser.id.toString(),
          },
        },
      },
    };

    const res = await POST(mockWebhookRequest(payload));
    expect(res.status).toBe(200);

    const db = getDb();
    const [updatedUser] = await db.select().from(users).where(eq(users.id, testUser.id));
    
    expect(updatedUser.stripeCustomerId).toBe('cus_test123');
    expect(updatedUser.stripeSubscriptionId).toBe('sub_test123');
    expect(updatedUser.stripePriceId).toBe('price_pro123');
    expect(updatedUser.subscriptionStatus).toBe('active');
    expect(updatedUser.stripeCurrentPeriodEnd).toBeDefined();
  });

  it('updates subscription details on customer.subscription.updated', async () => {
    const db = getDb();
    // First, give the user a subscription
    await db
      .update(users)
      .set({
        stripeCustomerId: 'cus_test123',
        stripeSubscriptionId: 'sub_test123',
        stripePriceId: 'price_pro123',
        subscriptionStatus: 'active',
        stripeCurrentPeriodEnd: new Date(Date.now() + 10 * 86400000),
      })
      .where(eq(users.id, testUser.id));

    const payload = {
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_test123',
          priceId: 'price_pro_new',
          status: 'past_due',
          currentPeriodEnd: new Date(Date.now() + 45 * 86400000).toISOString(),
        },
      },
    };

    const res = await POST(mockWebhookRequest(payload));
    expect(res.status).toBe(200);

    const [updatedUser] = await db.select().from(users).where(eq(users.id, testUser.id));
    expect(updatedUser.stripePriceId).toBe('price_pro_new');
    expect(updatedUser.subscriptionStatus).toBe('past_due');
  });

  it('cancels subscription details on customer.subscription.deleted', async () => {
    const db = getDb();
    // First, give the user an active subscription
    await db
      .update(users)
      .set({
        stripeCustomerId: 'cus_test123',
        stripeSubscriptionId: 'sub_test123',
        stripePriceId: 'price_pro123',
        subscriptionStatus: 'active',
        stripeCurrentPeriodEnd: new Date(Date.now() + 10 * 86400000),
      })
      .where(eq(users.id, testUser.id));

    const payload = {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_test123',
        },
      },
    };

    const res = await POST(mockWebhookRequest(payload));
    expect(res.status).toBe(200);

    const [updatedUser] = await db.select().from(users).where(eq(users.id, testUser.id));
    expect(updatedUser.subscriptionStatus).toBe('canceled');
    expect(updatedUser.stripePriceId).toBeNull();
  });
});
