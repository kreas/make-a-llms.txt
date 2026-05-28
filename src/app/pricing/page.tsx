import Link from 'next/link';
import { Check, HelpCircle } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { SiteFooter } from '@/components/layout/site-footer';
import { PricingButton } from './pricing-button';

export const metadata = {
  title: 'Pricing — AI Ready',
  description: 'Choose the right plan for indexing, generating, and maintaining your llms.txt context.',
};

const FAQ_ITEMS = [
  {
    question: 'How does the Pro subscription billing work?',
    answer: 'We bill monthly starting from the day you upgrade. You can easily upgrade, downgrade, or cancel your subscription at any time through our Stripe-powered billing portal.',
  },
  {
    question: 'What is a sitemap-to-llms.txt bridge?',
    answer: 'It is a system that reads your website sitemap, crawls each citable page, strips away navigation boilerplate/cookiewalls, and compiles a clean, structured llms.txt and llms-full.txt manifest optimized for LLM context windows.',
  },
  {
    question: 'Can I cancel my subscription at any time?',
    answer: 'Yes. You can click "Manage Subscription" on the pricing page or from the user settings to open the Stripe billing portal and cancel or update your plan.',
  },
];

export default async function PricingPage() {
  const user = await getCurrentUser();
  const isPro = user?.subscriptionStatus === 'active' || user?.subscriptionStatus === 'trialing';
  const hasStripeCustomerId = !!user?.stripeCustomerId;

  return (
    <div className="bg-canvas text-ink min-h-screen flex flex-col justify-between">
      {/* Top Navigation */}
      <nav className="sticky top-0 z-50 border-b border-hairline bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-6">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2 text-ink">
              {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src="/logo-v4.png"
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 shrink-0 rounded-md"
              />
              <span className="display-sm">AI Ready</span>
            </Link>
            <div className="hidden gap-8 md:flex">
              <Link
                href="/pricing"
                className="text-sm font-medium text-primary transition-colors duration-200"
              >
                Pricing
              </Link>
              <Link
                href="/docs"
                className="text-sm text-body transition-colors duration-200 hover:text-primary"
              >
                Docs
              </Link>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <Button asChild>
                <Link href="/dashboard">Open dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/signin">Sign In</Link>
                </Button>
                <Button asChild>
                  <Link href="/signup">Sign Up</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="mx-auto flex max-w-[1200px] flex-col items-center px-6 pt-20 pb-12 text-center">
        <h1 className="text-4xl sm:text-5xl lg:text-[56px] leading-[1.1] tracking-[-0.03em] max-w-4xl text-ink">
          Plans for projects of any size.
        </h1>
        <p className="mt-6 max-w-xl text-body text-base">
          Start generating LLM-friendly documentation manifests for free, or upgrade to Pro to unlock scheduled syncing and larger page limits.
        </p>
      </header>

      {/* Pricing Grid */}
      <main className="mx-auto w-full max-w-[1200px] px-6 pb-20 flex-grow">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
          
          {/* Hobby/Free Plan */}
          <section className="bg-surface-card rounded-xl p-8 border border-hairline flex flex-col justify-between transition-transform duration-300 hover:-translate-y-1">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-medium text-ink">Hobby</h3>
                {user && !isPro && (
                  <span className="caption-uppercase bg-surface-strong px-2 py-0.5 rounded-full text-[10px]">
                    Current Plan
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-strong min-h-[40px]">
                For personal sites, blogs, and open-source packages.
              </p>
              <div className="my-8">
                <span className="display-lg leading-none font-normal">$0</span>
                <span className="text-muted-strong text-sm ml-2">/ month</span>
              </div>
              
              <ul className="space-y-4 mb-8">
                {[
                  '1 active site sitemap',
                  'Manual run triggers',
                  '100 citable pages / run limit',
                  'Public llms.txt & llms-full.txt hosting',
                  'Basic markdown cleaning',
                  'API token access (v1 endpoints)',
                  'Webhook triggers for updates',
                ].map((feature) => (
                  <li key={feature} className="flex gap-3 text-sm text-body">
                    <Check className="size-4 text-semantic-success shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
            
            <PricingButton
              userId={user ? user.id : null}
              isPro={isPro}
              hasStripeCustomerId={hasStripeCustomerId}
              tier="free"
            />
          </section>

          {/* Pro Plan - Featured Tier Inverted Theme */}
          <section className="bg-ink text-canvas rounded-xl p-8 border border-ink flex flex-col justify-between transition-transform duration-300 hover:-translate-y-1 relative">
            <div className="absolute top-0 right-8 -translate-y-1/2 bg-primary text-on-primary text-[10px] font-bold caption-uppercase px-3 py-1 rounded-full">
              Featured
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-medium text-canvas">Pro</h3>
                {isPro && (
                  <span className="caption-uppercase bg-white/10 px-2 py-0.5 rounded-full text-[10px]">
                    Active
                  </span>
                )}
              </div>
              <p className="text-sm text-canvas/70 min-h-[40px]">
                For professional projects, indie hackers, and SaaS documentation.
              </p>
              <div className="my-8">
                <span className="display-lg leading-none font-normal text-canvas">$9</span>
                <span className="text-canvas/60 text-sm ml-2">/ month</span>
              </div>

              <ul className="space-y-4 mb-8">
                {[
                  'Up to 10 active site sitemaps',
                  'Scheduled automatic syncing (daily)',
                  'Webhook triggers for CI/CD integrations',
                  '500 citable pages / run limit',
                  'API token access (v1 endpoints)',
                  'AI-generated summaries of citable pages',
                  'Hallucination prevention audits',
                ].map((feature) => (
                  <li key={feature} className="flex gap-3 text-sm text-canvas/90">
                    <Check className="size-4 text-primary shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <PricingButton
              userId={user ? user.id : null}
              isPro={isPro}
              hasStripeCustomerId={hasStripeCustomerId}
              tier="pro"
            />
          </section>

          {/* Enterprise Plan */}
          <section className="bg-surface-card rounded-xl p-8 border border-hairline flex flex-col justify-between transition-transform duration-300 hover:-translate-y-1">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-medium text-ink">Enterprise</h3>
              </div>
              <p className="text-sm text-muted-strong min-h-[40px]">
                For large scale documentation requirements and custom integrations.
              </p>
              <div className="my-8">
                <span className="display-lg leading-none font-normal text-ink">Custom</span>
              </div>

              <ul className="space-y-4 mb-8">
                {[
                  'Unlimited site sitemaps',
                  'High-concurrency rendering pool',
                  'Custom crawl domain proxy configs',
                  'Dedicated database node availability',
                  'Custom SLA & uptime guarantees',
                  'Priority email & Slack support',
                ].map((feature) => (
                  <li key={feature} className="flex gap-3 text-sm text-body">
                    <Check className="size-4 text-semantic-success shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <PricingButton
              userId={user ? user.id : null}
              isPro={isPro}
              hasStripeCustomerId={hasStripeCustomerId}
              tier="enterprise"
            />
          </section>

        </div>

        {/* FAQs */}
        <section className="mt-32 max-w-3xl mx-auto">
          <h2 className="display-lg text-center mb-12 text-ink">
            Frequently Asked Questions
          </h2>
          <div className="space-y-8">
            {FAQ_ITEMS.map((faq) => (
              <div key={faq.question} className="border-b border-hairline pb-6">
                <h4 className="text-base font-semibold text-ink flex gap-2 items-center">
                  <HelpCircle className="size-4 text-muted-strong" />
                  {faq.question}
                </h4>
                <p className="mt-2 text-sm text-body pl-6 leading-relaxed">
                  {faq.answer}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Brand Inproduct timeline visualization (AI Timeline pastels as decorative background context) */}
        <section className="mt-32 border border-hairline rounded-xl bg-canvas-soft p-8 text-center flex flex-col items-center">
          <h3 className="display-md text-ink mb-4">Transparent Verification Pipeline</h3>
          <p className="text-body text-sm max-w-xl mb-8">
            See audit stages live. We keep documentation citable and fresh, verifying formatting issues through in-product agent workflows.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <span className="bg-timeline-thinking text-ink caption-uppercase px-3 py-1 rounded-full text-[10px] font-semibold border border-hairline">
              Thinking
            </span>
            <span className="bg-timeline-grep text-ink caption-uppercase px-3 py-1 rounded-full text-[10px] font-semibold border border-hairline">
              Grepping
            </span>
            <span className="bg-timeline-read text-ink caption-uppercase px-3 py-1 rounded-full text-[10px] font-semibold border border-hairline">
              Reading
            </span>
            <span className="bg-timeline-edit text-ink caption-uppercase px-3 py-1 rounded-full text-[10px] font-semibold border border-hairline">
              Editing
            </span>
            <span className="bg-timeline-done text-on-primary caption-uppercase px-3 py-1 rounded-full text-[10px] font-semibold">
              Done
            </span>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
