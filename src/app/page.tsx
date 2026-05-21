import Link from 'next/link';
import {
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  Terminal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SiteFooter } from '@/components/layout/site-footer';
import { getCurrentUser } from '@/lib/auth';

const NAV_LINKS: ReadonlyArray<{
  href: string;
  label: string;
}> = [
  { href: '#', label: 'Pricing' },
  { href: '/docs', label: 'Docs' },
];

const CRAWLER_ROWS = [
  { agent: 'GPTBot/1.0', status: 'ALLOWED', tone: 'grep' },
  { agent: 'ClaudeBot', status: 'ALLOWED', tone: 'read' },
  { agent: 'CCBot (CommonCrawl)', status: 'BLOCKED', tone: 'thinking' },
  { agent: 'PerplexityBot', status: 'READING', tone: 'edit' },
] as const;

const TONE_CLASSES: Record<(typeof CRAWLER_ROWS)[number]['tone'], string> = {
  grep: 'bg-semantic-success/15 text-semantic-success',
  read: 'bg-semantic-success/15 text-semantic-success',
  thinking: 'bg-destructive/15 text-destructive',
  edit: 'bg-surface-strong text-ink',
};

const FRESHNESS_CELLS = [
  100, 100, 70, 100, 35, 18, 'p', 100, 85, 55, 'p', 18, 100, 100, 45, 25, 100,
  100, 8, 18, 5, 'p40', 'p', 75, 18, 35, 100, 'p', 100, 85, 8, 100,
] as const;

function freshnessClass(cell: (typeof FRESHNESS_CELLS)[number]) {
  if (cell === 'p') return 'bg-semantic-success';
  if (cell === 'p40') return 'bg-semantic-success/40';
  const v = cell as number;
  if (v >= 95) return 'bg-ink';
  if (v >= 80) return 'bg-ink/80';
  if (v >= 60) return 'bg-ink/60';
  if (v >= 40) return 'bg-ink/40';
  if (v >= 20) return 'bg-ink/20';
  if (v >= 10) return 'bg-ink/10';
  return 'bg-ink/5';
}

export default async function Home() {
  const user = await getCurrentUser();
  const primaryHref = user ? '/dashboard' : '/signup';
  const primaryLabel = user ? 'Open dashboard' : 'Generate your llms.txt';

  return (
    <div className="bg-canvas text-ink">
      {/* Top Navigation */}
      <nav className="sticky top-0 z-50 border-b border-hairline bg-canvas">
        <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center justify-between px-6">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2 text-ink">
              <img
                src="/logo.webp"
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 shrink-0 rounded-md"
              />
              <span className="display-sm">AI Ready</span>
            </Link>
            <div className="hidden gap-8 md:flex">
              {NAV_LINKS.map(({ href, label }) => (
                <Link
                  key={label}
                  href={href}
                  className="text-sm text-body transition-colors duration-200 hover:text-primary"
                >
                  {label}
                </Link>
              ))}
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

      {/* Hero */}
      <header className="mx-auto flex max-w-[1200px] flex-col items-center px-6 py-20 text-center">
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-hairline bg-surface-card px-3 py-1">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          <span className="caption-uppercase text-primary">
            v1.0 — The Sitemap-to-llms.txt Bridge
          </span>
        </div>
        <h1 className="display-mega max-w-3xl text-ink">
          Documentation for the Agent Era.
        </h1>
        <p className="mt-8 max-w-2xl text-body">
          One-click bridge from any sitemap to high-fidelity LLM context. Ship{' '}
          <code className="font-mono">llms.txt</code> and{' '}
          <code className="font-mono">llms-full.txt</code> that AI agents
          actually understand, index, and cite — without hallucinating.
        </p>
        <div className="mt-12 flex flex-wrap justify-center gap-4">
          <Button asChild size="lg" className="h-11 bg-ink text-canvas hover:bg-ink/90">
            <Link href={primaryHref}>{primaryLabel}</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-11">
            <Link href="/docs/manifesto">Read the Manifesto</Link>
          </Button>
        </div>

        {/* IDE Mockup */}
        <div className="mt-16 w-full max-w-4xl">
          <div className="ide-mockup-card overflow-hidden rounded-xl border border-hairline bg-surface-card shadow-none">
            {/* Header bar mimicking an IDE */}
            <div className="flex items-center justify-between border-b border-hairline bg-canvas-soft px-4 py-2">
              <div className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full bg-hairline-strong" />
                <div className="h-2.5 w-2.5 rounded-full bg-hairline-strong" />
                <div className="h-2.5 w-2.5 rounded-full bg-hairline-strong" />
              </div>
              <span className="font-mono text-[12px] text-body">
                devengine.ai — Cursor Editor
              </span>
              <div className="w-12" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 min-h-[300px]">
              {/* Sidebar Pane */}
              <div className="hidden md:block md:col-span-1 border-r border-hairline bg-canvas-soft p-4 text-left font-mono text-[13px] leading-relaxed text-body">
                <div className="caption-uppercase mb-4 text-muted-soft text-[11px] font-semibold tracking-wider">PROJECT</div>
                <div className="space-y-2">
                  <div className="text-ink">src/</div>
                  <div className="pl-3 text-ink">components/</div>
                  <div className="pl-6 text-muted-soft">crawler.tsx</div>
                  <div className="pl-6 text-muted-soft">parser.tsx</div>
                  <div className="text-ink">output/</div>
                  <div className="pl-3 text-primary font-medium">llms.txt</div>
                  <div className="pl-3 text-muted-soft">llms-full.txt</div>
                </div>
              </div>
              {/* Main Editor Pane */}
              <div className="p-6 text-left md:col-span-3 bg-surface-card font-mono text-[13px] leading-relaxed text-ink">
                <div className="caption-uppercase mb-4 text-muted-soft text-[11px] font-semibold tracking-wider">output/llms.txt</div>
                <pre className="font-mono text-[13px] leading-relaxed text-ink">
                  <code>{`# devengine.ai

> Automatic context generation
> for LLM ingestion.

## Docs
- [Quickstart](/docs/start)
- [API Reference](/docs/api)
- [Auth](/docs/auth)

## Modules
- /auth: JWT identity
- /ingest: crawler logic
- /vector: embeddings`}</code>
                </pre>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Bento Grid */}
      <main className="mx-auto max-w-[1200px] px-6 pb-20">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          {/* Crawler Audit */}
          <section className="relative flex flex-col rounded-xl border border-hairline bg-surface-card p-6 md:col-span-5">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-ink">
                  Crawler Audit
                </h3>
                <p className="text-sm text-muted-strong">
                  Agent transparency protocol
                </p>
              </div>
              <ShieldCheck className="size-5 text-body" />
            </div>
            <div className="flex flex-grow flex-col gap-3">
              {CRAWLER_ROWS.map(({ agent, status, tone }) => (
                <div
                  key={agent}
                  className="flex items-center justify-between rounded-lg border border-hairline-soft bg-canvas-soft p-4"
                >
                  <span className="font-mono text-[13px]">{agent}</span>
                  <span
                    className={`caption-uppercase rounded-full px-2 py-0.5 text-[10px] ${TONE_CLASSES[tone]}`}
                  >
                    {status}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Citation Readiness */}
          <section className="flex flex-col items-center gap-8 rounded-xl border border-hairline bg-surface-card p-6 md:col-span-7 md:flex-row">
            <div className="w-full md:w-1/2">
              <h3 className="text-lg font-semibold text-ink">
                Citation Readiness
              </h3>
              <p className="mb-8 text-sm text-muted-strong">
                Score based on technical density and metadata freshness.
              </p>
              <div className="space-y-1">
                <div className="flex justify-between font-mono text-[12px]">
                  <span>H1 Hierarchy</span>
                  <span className="text-semantic-success">Pass</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-hairline">
                  <div className="h-full w-full bg-semantic-success" />
                </div>
                <div className="mt-5 flex justify-between font-mono text-[12px]">
                  <span>Last-Modified Headers</span>
                  <span className="text-destructive">Missing</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-hairline">
                  <div className="h-full w-[30%] bg-destructive" />
                </div>
              </div>
            </div>
            <div className="flex w-full justify-center md:w-1/2">
              <div className="relative flex h-40 w-40 items-center justify-center rounded-full border-8 border-hairline-soft">
                <div
                  className="absolute inset-0 rounded-full border-8 border-ink"
                  style={{
                    clipPath:
                      'polygon(50% 50%, 0 0, 100% 0, 100% 100%, 0 100%, 0 85%)',
                  }}
                />
                <div className="text-center">
                  <span className="display-lg block leading-none">82</span>
                  <span className="caption-uppercase text-muted-strong">
                    Citable
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* LLM Extraction Test */}
          <section className="flex flex-col rounded-xl border border-ink bg-ink p-6 text-canvas md:col-span-7">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">LLM Extraction Test</h3>
                <p className="font-mono text-[12px] opacity-60">
                  Simulating Claude-3.5-Sonnet perception
                </p>
              </div>
              <Terminal className="size-5 opacity-50" />
            </div>
            <div className="grid flex-grow grid-cols-1 gap-4 font-mono text-[13px] md:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-white/5 p-4">
                <div className="caption-uppercase mb-3 opacity-40">
                  Actual Intent
                </div>
                <div className="text-timeline-read">
                  &ldquo;auth_token&rdquo; is a 64-character hex string passed
                  via Header.
                </div>
              </div>
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
                <div className="caption-uppercase mb-3 text-destructive opacity-80">
                  LLM Hallucination
                </div>
                <div className="text-destructive">
                  &ldquo;auth_token&rdquo; is{' '}
                  <span className="bg-destructive px-1 text-white">
                    base64 encoded
                  </span>{' '}
                  and passed via{' '}
                  <span className="bg-destructive px-1 text-white">
                    URL param
                  </span>
                  .
                </div>
              </div>
            </div>
            <div className="mt-8 flex items-center gap-3">
              <span className="caption-uppercase rounded-full bg-timeline-done px-2 py-0.5 text-[10px] text-ink">
                Remediation Reqd
              </span>
              <span className="text-[12px] opacity-60">
                Schema.org injection recommended for this node.
              </span>
            </div>
          </section>

          {/* Freshness Map */}
          <section className="rounded-xl border border-hairline bg-surface-card p-6 md:col-span-5">
            <h3 className="text-lg font-semibold text-ink">Freshness Map</h3>
            <p className="mb-8 text-sm text-muted-strong">
              Visualizing documentation decay.
            </p>
            <div className="grid grid-cols-8 gap-1">
              {FRESHNESS_CELLS.map((cell, i) => (
                <div
                  key={i}
                  className={`aspect-square rounded-sm ${freshnessClass(cell)}`}
                />
              ))}
            </div>
            <div className="mt-6 flex justify-between font-mono text-[10px] text-muted-strong">
              <span>Stale (2yr+)</span>
              <span>Recent (24h)</span>
            </div>
          </section>

          {/* Code Output */}
          <section className="overflow-hidden rounded-xl border border-hairline bg-canvas-soft md:col-span-12">
            <div className="flex items-center justify-between border-b border-hairline bg-hairline-soft px-6 py-2">
              <span className="font-mono text-[12px] text-body">
                output/llms.txt
              </span>
              <div className="flex gap-2">
                <div className="h-3 w-3 rounded-full bg-hairline-strong" />
                <div className="h-3 w-3 rounded-full bg-hairline-strong" />
              </div>
            </div>
            <div className="overflow-x-auto p-6">
              <pre className="font-mono text-[13px] leading-relaxed text-ink">
                <code>{`# DevEngine Semantic Manifest
# Generated for AI Documentation Agents

Full Docs: https://devengine.ai/docs
API Reference: https://devengine.ai/api
{
  "@context": "https://schema.org",
  "@type": "SoftwareSourceCode",
  "name": "DevEngine Agent Protocol",
  "runtimePlatform": "Node.js",
  "programmingLanguage": "TypeScript",
  "abstract": "Automatic context generation for LLM ingestion."
}

## Core Modules
- /auth: JWT-based stateless identity
- /ingest: Multi-threaded crawler logic
- /vector: Metadata-pinned embeddings`}</code>
              </pre>
            </div>
          </section>
        </div>
      </main>

      {/* Content Band */}
      <section
        id="how-it-works"
        className="mx-auto max-w-[1200px] px-6 py-20"
      >
        <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-2">
          <div>
            <h2 className="display-lg mb-8 text-ink">
              Built for the context window.
            </h2>
            <p className="mb-6 text-body">
              Modern LLMs don&apos;t want your marketing copy. They want clean,
              structured, cited technical data. AI Ready strips the noise
              and generates the perfect <code className="font-mono">llms.txt</code>{' '}
              and <code className="font-mono">json-ld</code> manifests for your
              site.
            </p>
            <ul className="space-y-4">
              {[
                'Automatic Markdown cleanup & normalization',
                'Semantic schema injection for better RAG performance',
                'Real-time hallucination prevention monitoring',
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <CheckCircle2 className="size-5 text-semantic-success" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative">
            <div className="relative z-10 rotate-2 rounded-xl border border-hairline bg-surface-card p-4">
              <div className="rounded-lg border border-hairline bg-canvas-soft p-6">
                <div className="caption-uppercase mb-4 text-muted-strong">
                  llms.txt preview
                </div>
                <div className="space-y-2 font-mono text-[12px] text-body">
                  <div># yoursite.com</div>
                  <div className="text-muted-soft">
                    &gt; Concise summary for agents.
                  </div>
                  <div>&nbsp;</div>
                  <div>## Sections</div>
                  <div>- [Pricing](/pricing): plan tiers</div>
                  <div>- [Docs](/docs): API + SDK</div>
                  <div>- [Changelog](/changelog): releases</div>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-4 -left-4 z-20 -rotate-3 rounded-xl bg-ink p-6 text-canvas border border-hairline-strong">
              <div className="display-sm font-semibold">4.2x</div>
              <div className="caption-uppercase">Better Retrieval Accuracy</div>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
