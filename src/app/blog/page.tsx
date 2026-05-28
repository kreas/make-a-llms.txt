import { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { SiteFooter } from '@/components/layout/site-footer';
import { getCurrentUser } from '@/lib/auth';
import { blogSource } from '@/lib/docs/source';
import { BlogListingClient } from '@/components/blog/blog-listing-client';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Insights and guides on Generative Engine Optimization (GEO), Answer Engine Optimization (AEO), and preparing websites for AI search engines.',
  openGraph: {
    title: 'Blog — AI Ready',
    description: 'Insights and guides on Generative Engine Optimization (GEO), Answer Engine Optimization (AEO), and preparing websites for AI search engines.',
    url: 'https://www.aiready.cat/blog',
    siteName: 'AI Ready',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Blog — AI Ready',
    description: 'Insights and guides on Generative Engine Optimization (GEO), Answer Engine Optimization (AEO), and preparing websites for AI search engines.',
  },
};

export default async function BlogPage() {
  const user = await getCurrentUser();
  const posts = blogSource.getPages();

  const serializablePosts = posts.map((post) => ({
    url: post.url,
    slugs: post.slugs,
    data: {
      title: post.data.title,
      description: post.data.description,
      date: post.data.date instanceof Date ? post.data.date.toISOString() : post.data.date,
      readingTime: post.data.readingTime,
      category: post.data.category,
      image: post.data.image,
      ogImage: post.data.ogImage,
      draft: post.data.draft,
      author: post.data.author,
    },
  }));

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

      {/* Main Listing View (Client-side interactive layout) */}
      <main className="flex-grow pt-12">
        <BlogListingClient posts={serializablePosts} />
      </main>

      <SiteFooter />
    </div>
  );
}
