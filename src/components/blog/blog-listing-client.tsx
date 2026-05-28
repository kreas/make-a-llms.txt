'use client';

import Link from 'next/link';
import { Calendar, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

type BlogPost = {
  url: string;
  slugs: string[];
  data: {
    title: string;
    description?: string;
    date?: string | Date;
    readingTime?: string;
    category?: string;
    image?: string;
    ogImage?: string;
    draft?: boolean;
    author?: any;
  };
};

type Props = {
  posts: BlogPost[];
};

function formatDate(dateStr?: string | Date) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function BlogListingClient({ posts }: Props) {
  // Sort posts descending by date (latest first) to be absolutely sure
  const sortedPosts = [...posts].sort((a, b) => {
    const dateA = new Date(a.data.date || '');
    const dateB = new Date(b.data.date || '');
    return dateB.getTime() - dateA.getTime();
  });

  const featuredPost = sortedPosts[0];
  const gridPosts = sortedPosts.slice(1);

  return (
    <div className="w-full max-w-[1200px] mx-auto px-6 pb-24">
      {/* Featured Post (Latest) */}
      {featuredPost && (
        <section className="mb-8 md:mb-10 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center animate-fade-in-up delay-75">
          <div className="relative aspect-[4/3] sm:aspect-[16/10] md:aspect-[4/3] w-full rounded-2xl overflow-hidden border border-hairline bg-surface-strong group shrink-0">
            <Link href={featuredPost.url}>
              <img
                src={featuredPost.data.image || featuredPost.data.ogImage}
                alt=""
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-102"
              />
            </Link>
          </div>
          <div className="space-y-6 text-left">
            {featuredPost.data.category && (
              <span className="text-xs font-mono uppercase tracking-wider text-primary">
                {featuredPost.data.category}
              </span>
            )}
            <Link href={featuredPost.url} className="block group">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl text-ink font-normal leading-tight tracking-tight group-hover:text-primary transition-colors duration-200">
                {featuredPost.data.title}
              </h2>
            </Link>
            <div className="flex items-center gap-4 text-xs text-muted-strong font-mono">
              {featuredPost.data.date && (
                <span className="flex items-center gap-1">
                  <Calendar className="size-3.5" />
                  {formatDate(featuredPost.data.date)}
                </span>
              )}
              {featuredPost.data.readingTime && (
                <span className="flex items-center gap-1">
                  <Clock className="size-3.5" />
                  {featuredPost.data.readingTime}
                </span>
              )}
            </div>
            {featuredPost.data.description && (
              <p className="text-body text-sm sm:text-base leading-relaxed">
                {featuredPost.data.description}
              </p>
            )}
            <Button
              asChild
              variant="outline"
              className="rounded-full px-6 hover:bg-ink hover:text-canvas transition-colors duration-200"
            >
              <Link href={featuredPost.url}>Read article</Link>
            </Button>
          </div>
        </section>
      )}

      {/* Grid of Remaining Posts */}
      {gridPosts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-10 animate-fade-in-up delay-100">
            {gridPosts.map((post) => {
              const imageUrl = post.data.image || post.data.ogImage;
              return (
                <article key={post.url} className="group flex flex-col space-y-4 text-left">
                  <div className="relative aspect-[4/3] rounded-xl overflow-hidden border border-hairline bg-surface-strong shrink-0">
                    <Link href={post.url}>
                      <img
                        src={imageUrl}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-102"
                      />
                    </Link>
                  </div>
                  <div className="space-y-2 flex-grow">
                    {post.data.category && (
                      <span className="text-[10px] font-mono uppercase tracking-wider text-primary">
                        {post.data.category}
                      </span>
                    )}
                    <Link href={post.url} className="block">
                      <h3 className="text-lg font-normal text-ink leading-tight tracking-tight group-hover:text-primary transition-colors duration-200 line-clamp-2">
                        {post.data.title}
                      </h3>
                    </Link>
                    {post.data.description && (
                      <p className="text-body text-xs leading-relaxed line-clamp-2">
                        {post.data.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-strong font-mono pt-3 border-t border-hairline/50">
                    <span>{formatDate(post.data.date)}</span>
                    {post.data.readingTime && <span>{post.data.readingTime}</span>}
                  </div>
                </article>
              );
            })}
          </div>
      )}
    </div>
  );
}
