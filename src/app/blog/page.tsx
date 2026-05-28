import { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { SiteHeader } from '@/components/layout/site-header';
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
      <SiteHeader authenticated={!!user} />

      {/* Main Listing View (Client-side interactive layout) */}
      <main className="flex-grow pt-12">
        <BlogListingClient posts={serializablePosts} />
      </main>

      <SiteFooter />
    </div>
  );
}
