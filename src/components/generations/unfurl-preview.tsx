'use client';

import { useState } from 'react';
import { Globe, Search, MessageSquare } from 'lucide-react';

const TwitterIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);
import type { ManifestPage } from './pages-tree';

interface UnfurlPreviewProps {
  fields: Record<string, string>;
  selectedPage: ManifestPage;
}

export function UnfurlPreview({ fields, selectedPage }: UnfurlPreviewProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'google' | 'slack' | 'twitter'>('all');

  const title = fields.title || selectedPage.filename || 'Untitled Page';
  const description = fields.description || fields.summary || 'No description meta tag provided for this page. Add a description in your page frontmatter to specify a summary for search engines and social shares.';
  const rawUrl = fields.canonical || fields.url || selectedPage.url || 'https://example.com';
  const imageUrl = fields.image || fields.ogImage || '';

  const parsedUrl = (() => {
    try {
      return new URL(rawUrl);
    } catch {
      return new URL('https://example.com');
    }
  })();

  const domain = parsedUrl.hostname.replace('www.', '');
  const displayUrl = parsedUrl.href;

  const brandName = (() => {
    const titleVal = fields.title || '';
    let segments: string[] = [];
    if (titleVal.includes('|')) {
      segments = titleVal.split('|').map((s) => s.trim());
    } else if (titleVal.includes(' - ')) {
      segments = titleVal.split(' - ').map((s) => s.trim());
    } else if (titleVal.includes(' – ')) {
      segments = titleVal.split(' – ').map((s) => s.trim());
    }
    
    if (segments.length > 0) {
      const domainBase = domain.split('.')[0].toLowerCase();
      const match = segments.find(s => s.toLowerCase().includes(domainBase));
      if (match) return match;
      return segments[segments.length - 1];
    }
    const parts = domain.split('.');
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  })();

  const breadcrumbs = (() => {
    const path = parsedUrl.pathname === '/' ? '' : parsedUrl.pathname;
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) return domain;
    return `${domain} › ${parts.join(' › ')}`;
  })();

  const renderGoogle = () => (
    <div className="bg-white border border-[#dadde1] rounded-lg p-5 shadow-sm max-w-[650px] w-full font-[arial,sans-serif] text-left select-none animate-fade-in-up">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-[#f1f3f4] text-[#5f6368]">
          <Globe className="h-4 w-4" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[14px] leading-[20px] font-normal text-[#202124] truncate">{brandName}</span>
          <span className="text-[12px] leading-[16px] font-normal text-[#5f6368] truncate">{displayUrl}</span>
        </div>
      </div>
      <h3 className="text-[20px] leading-[26px] font-normal text-[#1a0dab] hover:underline cursor-pointer mb-1 line-clamp-1 font-sans">
        {title}
      </h3>
      <p className="text-[14px] leading-[22px] font-normal text-[#4d5156] line-clamp-2">
        {description}
      </p>
    </div>
  );

  const renderSlack = () => (
    <div className="bg-white border border-[#e2e8f0] dark:border-[#2d3748] rounded-lg p-4 shadow-sm max-w-[550px] w-full text-left font-sans select-none animate-fade-in-up flex gap-3 border-l-4 border-l-[#f54e00]">
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2">
          <Globe className="h-3.5 w-3.5 text-[#f54e00]" />
          <span className="text-xs font-bold text-[#1d1c1d]">{brandName}</span>
        </div>
        <h4 className="text-[15px] font-bold text-[#1264a3] hover:underline cursor-pointer line-clamp-1 leading-snug">
          {title}
        </h4>
        <p className="text-[15px] text-[#1d1c1d] leading-relaxed line-clamp-3">
          {description}
        </p>
        {imageUrl ? (
          <div className="mt-2 rounded-lg overflow-hidden border border-hairline max-w-[360px] aspect-[1.91/1] bg-canvas-soft relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="Slack og:image preview" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="mt-2 rounded-lg border border-dashed border-hairline-strong bg-canvas-soft p-4 max-w-[360px] text-center flex flex-col items-center justify-center gap-1">
            <span className="text-xs text-muted-strong font-semibold">No cover image specified</span>
            <span className="text-[10px] text-muted-soft">Add `image` or `ogImage` to frontmatter to show a rich preview.</span>
          </div>
        )}
      </div>
    </div>
  );

  const renderTwitter = () => (
    <div className="border border-[#e1e8ed] dark:border-[#2f3336] bg-white rounded-2xl overflow-hidden max-w-[500px] w-full flex flex-col text-left font-sans select-none animate-fade-in-up hover:border-[#ccd6dd] dark:hover:border-[#3f4448] transition-colors cursor-pointer">
      {imageUrl ? (
        <div className="aspect-[1.91/1] w-full bg-canvas-soft relative border-b border-[#e1e8ed] dark:border-[#2f3336]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="Twitter og:image preview" className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="aspect-[1.91/1] w-full bg-canvas-soft border-b border-dashed border-hairline-strong flex flex-col items-center justify-center p-6 text-center gap-1">
          <span className="text-xs text-muted-strong font-semibold">No og:image specified</span>
          <span className="text-[10px] text-muted-soft">Using summary card preview fallback. Add an image for large previews.</span>
        </div>
      )}
      <div className="p-3 flex flex-col gap-1 bg-white">
        <span className="text-[13px] font-normal text-[#536471] lowercase truncate">{domain}</span>
        <h4 className="text-[14.5px] font-bold text-[#0f1419] line-clamp-1 leading-snug">{title}</h4>
        <p className="text-[14px] font-normal text-[#536471] line-clamp-2 leading-[18px]">{description}</p>
      </div>
    </div>
  );

  return (
    <div className="bg-canvas-soft border border-hairline rounded-lg overflow-hidden flex flex-col animate-fade-in-up">
      {/* Header Tabs */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center px-4 py-2 border-b border-hairline bg-surface-card/40 gap-3">
        <span className="font-mono text-xs text-muted-strong font-medium">Unfurl Metadata Preview</span>
        
        {/* Toggle Controls */}
        <div className="flex items-center gap-1 border border-hairline rounded-lg p-0.5 bg-surface-card/50 w-fit">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer select-none ${
              activeTab === 'all'
                ? 'bg-surface-strong text-ink font-semibold'
                : 'text-muted-strong hover:text-ink hover:bg-canvas-soft'
            }`}
          >
            All Previews
          </button>
          <button
            onClick={() => setActiveTab('google')}
            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer select-none ${
              activeTab === 'google'
                ? 'bg-surface-strong text-ink font-semibold'
                : 'text-muted-strong hover:text-ink hover:bg-canvas-soft'
            }`}
          >
            <Search className="h-3 w-3" />
            Google
          </button>
          <button
            onClick={() => setActiveTab('slack')}
            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer select-none ${
              activeTab === 'slack'
                ? 'bg-surface-strong text-ink font-semibold'
                : 'text-muted-strong hover:text-ink hover:bg-canvas-soft'
            }`}
          >
            <MessageSquare className="h-3 w-3" />
            Slack
          </button>
          <button
            onClick={() => setActiveTab('twitter')}
            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer select-none ${
              activeTab === 'twitter'
                ? 'bg-surface-strong text-ink font-semibold'
                : 'text-muted-strong hover:text-ink hover:bg-canvas-soft'
            }`}
          >
            <TwitterIcon className="h-3 w-3" />
            Twitter/X
          </button>
        </div>
      </div>

      {/* Previews Content */}
      <div className="p-6 flex flex-col gap-6 overflow-y-auto max-h-[600px] bg-[#fcfcfa]">
        {(activeTab === 'all' || activeTab === 'google') && (
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold text-muted-soft uppercase tracking-wider select-none">Google Search Snippet Preview</span>
            {renderGoogle()}
          </div>
        )}
        
        {(activeTab === 'all' || activeTab === 'slack') && (
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold text-muted-soft uppercase tracking-wider select-none">Slack Rich Unfurl Preview</span>
            {renderSlack()}
          </div>
        )}

        {(activeTab === 'all' || activeTab === 'twitter') && (
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold text-muted-soft uppercase tracking-wider select-none">Twitter / X Large Image Card Preview</span>
            {renderTwitter()}
          </div>
        )}
      </div>
    </div>
  );
}
