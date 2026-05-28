import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Calendar, Clock, ArrowLeft } from 'lucide-react';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Button } from '@/components/ui/button';
import { SiteFooter } from '@/components/layout/site-footer';
import { getCurrentUser } from '@/lib/auth';
import { blogSource } from '@/lib/docs/source';

const XIcon = () => (
  <svg className="size-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const LinkedInIcon = () => (
  <svg className="size-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452z" />
  </svg>
);

const HNIcon = () => (
  <svg className="size-3.5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
    <path fillRule="evenodd" d="M0 0h24v24H0V0zm12.35 12.825l3.825-7.35h-2.1l-2.65 5.3-2.775-5.3H6.55l3.85 7.375V18h1.95v-5.175z" clipRule="evenodd" />
  </svg>
);

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = blogSource.getPage([slug]);
  if (!page) return {};

  const title = page.data.title;
  const description = page.data.description;
  const ogImageUrl = page.data.ogImage || page.data.image || '/logo-v4.png';
  const canonicalUrl = page.data.canonical || `https://www.aiready.cat/blog/${slug}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: `${title} — AI Ready`,
      description,
      url: canonicalUrl,
      siteName: 'AI Ready',
      type: 'article',
      publishedTime: page.data.date instanceof Date ? page.data.date.toISOString() : page.data.date,
      modifiedTime: page.data.updated instanceof Date ? page.data.updated.toISOString() : page.data.updated,
      authors: (page.data.author as any)?.name ? [(page.data.author as any).name] : ['AI Ready Team'],
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} — AI Ready`,
      description,
      images: [ogImageUrl],
    },
  };
}

function formatDate(dateStr?: string | Date) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const user = await getCurrentUser();
  const page = blogSource.getPage([slug]);

  if (!page) notFound();

  const MDX = page.data.body;
  const formattedDate = formatDate(page.data.date);
  const readTime = page.data.readingTime;
  const category = page.data.category;

  const canonicalUrl = page.data.canonical || `https://www.aiready.cat/blog/${slug}`;

  // Image absolute URL resolution
  const imageUrl = page.data.image
    ? (page.data.image.startsWith('/')
      ? `https://www.aiready.cat${page.data.image}`
      : page.data.image)
    : undefined;

  // Dates formatting
  const datePublished = page.data.date instanceof Date
    ? page.data.date.toISOString()
    : page.data.date;
  const dateModified = page.data.updated instanceof Date
    ? page.data.updated.toISOString()
    : page.data.updated || datePublished;

  // Author mapping
  const authorData = page.data.author as { name: string; url?: string; sameAs?: string[] } | undefined;
  const authorBlock = authorData
    ? {
        '@type': 'Person',
        name: authorData.name,
        ...(authorData.url ? { url: authorData.url } : {}),
        ...(authorData.sameAs ? { sameAs: authorData.sameAs } : {}),
      }
    : {
        '@type': 'Person',
        name: 'AI Ready Team',
      };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': page.data.schema || 'Article',
    headline: page.data.title,
    description: page.data.description,
    ...(datePublished ? { datePublished } : {}),
    ...(dateModified ? { dateModified } : {}),
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonicalUrl,
    },
    url: canonicalUrl,
    ...(imageUrl ? { image: imageUrl } : {}),
    author: authorBlock,
    publisher: {
      '@type': 'Organization',
      name: 'AI Ready',
      url: 'https://www.aiready.cat',
      logo: {
        '@type': 'ImageObject',
        url: 'https://www.aiready.cat/logo-v4.png',
      },
    },
    ...(category ? { articleSection: category } : {}),
    ...(page.data.tags && page.data.tags.length > 0
      ? { keywords: page.data.tags.join(', ') }
      : {}),
  };

  return (
    <div className="bg-canvas text-ink min-h-screen flex flex-col justify-between">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
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
                className="text-sm text-body transition-colors duration-200 hover:text-primary"
              >
                Pricing
              </Link>
              <Link
                href="/docs"
                className="text-sm text-body transition-colors duration-200 hover:text-primary"
              >
                Docs
              </Link>
              <Link
                href="/blog"
                className="text-sm font-medium text-primary transition-colors duration-200"
              >
                Blog
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

      {/* Main Article Container */}
      <main className="mx-auto w-full max-w-[800px] px-6 py-12 flex-grow animate-fade-in-up">
        {/* Back Link */}
        <Link
          href="/blog"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-strong hover:text-ink transition-colors duration-200 mb-8 group"
        >
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" />
          Back to Blog
        </Link>

        {/* Article Header */}
        <header className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            {category && (
              <span className="caption-uppercase bg-surface-strong px-2.5 py-0.5 rounded-full text-[10px] font-semibold text-ink border border-hairline">
                {category}
              </span>
            )}
            <div className="flex items-center gap-4 text-xs text-muted-strong font-mono">
              {formattedDate && (
                <span className="flex items-center gap-1">
                  <Calendar className="size-3.5" />
                  {formattedDate}
                </span>
              )}
              {readTime && (
                <span className="flex items-center gap-1">
                  <Clock className="size-3.5" />
                  {readTime}
                </span>
              )}
            </div>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-[44px] leading-[1.15] tracking-[-0.02em] text-ink font-normal">
            {page.data.title}
          </h1>

          {/* Cover Image under the title */}
          {(page.data.image || page.data.ogImage) && (
            <div className="mt-8 overflow-hidden rounded-xl border border-hairline aspect-[21/9] relative bg-surface-strong">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={page.data.image || page.data.ogImage}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
          )}
        </header>

        {/* Article Body */}
        <article className="prose prose-no-margin text-ink max-w-none pt-6 pb-16">
          <MDX components={defaultMdxComponents} />
        </article>

        {/* Article Footer (Author Details + Social Share) */}
        <footer className="pt-8 border-t border-hairline flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
          {/* Author Card */}
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-timeline-thinking flex items-center justify-center text-sm font-bold text-ink">
              {(page.data.author as any)?.name?.[0] || 'A'}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-ink">
                {(page.data.author as any)?.name || 'AI Ready Team'}
              </span>
              <span className="text-xs text-muted-strong">Author</span>
            </div>
          </div>

          {/* Social Share Links */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono uppercase tracking-wider text-muted-strong">Share</span>
            <div className="flex items-center gap-2">
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(page.data.title)}&url=${encodeURIComponent(page.data.canonical || `https://www.aiready.cat/blog/${slug}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Share on X"
                className="flex size-8 items-center justify-center rounded-md border border-hairline bg-surface-card text-muted-strong hover:text-ink hover:border-hairline-strong hover:bg-surface-strong transition-all duration-200"
              >
                <XIcon />
              </a>
              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(page.data.canonical || `https://www.aiready.cat/blog/${slug}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Share on LinkedIn"
                className="flex size-8 items-center justify-center rounded-md border border-hairline bg-surface-card text-muted-strong hover:text-ink hover:border-hairline-strong hover:bg-surface-strong transition-all duration-200"
              >
                <LinkedInIcon />
              </a>
              <a
                href={`https://news.ycombinator.com/submitlink?u=${encodeURIComponent(page.data.canonical || `https://www.aiready.cat/blog/${slug}`)}&t=${encodeURIComponent(page.data.title)}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Share on Hacker News"
                className="flex size-8 items-center justify-center rounded-md border border-hairline bg-surface-card text-muted-strong hover:text-ink hover:border-hairline-strong hover:bg-surface-strong transition-all duration-200"
              >
                <HNIcon />
              </a>
            </div>
          </div>
        </footer>
      </main>

      <SiteFooter />
    </div>
  );
}

export function generateStaticParams() {
  return blogSource.generateParams().map((params) => ({
    slug: params.slug[0],
  }));
}
