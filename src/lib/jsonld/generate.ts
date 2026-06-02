import { parseFrontmatterFieldsSafe } from '@/lib/markdown/frontmatter-fields';

export type GenerateJsonLdArgs = {
  fields: Record<string, string>;
  body?: string;
  /** URL of the page being rendered (was selectedPage?.url in the panel). */
  selectedPageUrl?: string;
  /** Raw markdown of the site's index page, used to resolve the publisher logo. */
  indexMarkdown?: string | null;
};

export function generateJsonLd(args: GenerateJsonLdArgs): string {
  const { fields, body, selectedPageUrl, indexMarkdown } = args;

  const title = fields['title'] || '';
  const description = fields['description'] || fields['summary'] || '';
  const url = fields['url'] || selectedPageUrl || '';
  const canonical = fields['canonical'] || url;
  const dateModified = fields['updated'] || '';

  const brandUrl = (() => {
    try {
      return new URL(canonical).origin;
    } catch {
      return '';
    }
  })();

  let bodyImageUrl: string | undefined = undefined;
  if (body && !fields['image'] && !fields['ogImage']) {
    // Find first markdown image: ![alt](url)
    const mdMatch = body.match(/!\[.*?\]\((.*?)\)/);
    if (mdMatch && mdMatch[1]) {
      bodyImageUrl = mdMatch[1];
    } else {
      // Find first HTML/JSX image: <img ... src="url"
      const htmlMatch = body.match(/<img\s+[^>]*?src=["'](.*?)["']/i);
      if (htmlMatch && htmlMatch[1]) {
        bodyImageUrl = htmlMatch[1];
      }
    }
  }

  if (bodyImageUrl) {
    bodyImageUrl = bodyImageUrl.trim().replace(/^['"]|['"]$/g, '');
    if (!bodyImageUrl.startsWith('http://') && !bodyImageUrl.startsWith('https://')) {
      if (brandUrl) {
        const cleanPath = bodyImageUrl.startsWith('/') ? bodyImageUrl : `/${bodyImageUrl}`;
        bodyImageUrl = `${brandUrl}${cleanPath}`;
      }
    }
  }

  const imageUrl = fields['image'] || fields['ogImage'] || bodyImageUrl || undefined;

  const getPageSchemaType = (): string => {
    const rawType = fields['page_type'] || '';
    if (rawType === 'blog') return 'BlogPosting';
    if (rawType === 'product') return 'Product';
    if (rawType === 'location') return 'Place';
    if (rawType === 'menu') return 'Menu';
    if (rawType === 'careers') return 'JobPosting';
    if (rawType === 'contact') return 'ContactPage';
    if (rawType === 'about') return 'AboutPage';

    // Fallback heuristics based on the URL path
    const pathLower = canonical.toLowerCase();
    if (pathLower.includes('/blog/') || pathLower.includes('/news/') || pathLower.includes('/article/') || pathLower.includes('/articles/') || pathLower.includes('/press/')) {
      return 'BlogPosting';
    }
    if (pathLower.includes('/product/') || pathLower.includes('/shop/') || pathLower.includes('/store/')) {
      return 'Product';
    }
    if (pathLower.includes('/contact')) {
      return 'ContactPage';
    }
    if (pathLower.includes('/about')) {
      return 'AboutPage';
    }
    if (pathLower.includes('/careers') || pathLower.includes('/jobs') || pathLower.includes('/careers/')) {
      return 'JobPosting';
    }

    const typeMap: Record<string, string> = {
      legal: 'WebPage',
      landing: 'WebPage',
      other: 'WebPage',
    };
    return typeMap[rawType] || 'WebPage';
  };
  const schemaType = getPageSchemaType();

  const getBrandName = () => {
    let segments: string[] = [];
    if (title.includes('|')) {
      segments = title.split('|').map((s) => s.trim());
    } else if (title.includes(' - ')) {
      segments = title.split(' - ').map((s) => s.trim());
    } else if (title.includes(' – ')) {
      segments = title.split(' – ').map((s) => s.trim());
    } else if (title.includes(' — ')) {
      segments = title.split(' — ').map((s) => s.trim());
    }

    try {
      const u = new URL(canonical);
      const hostBase = u.hostname.replace('www.', '').split('.')[0].toLowerCase();

      if (segments.length > 0) {
        const matchingSegment = segments.find(seg => seg.toLowerCase().includes(hostBase));
        if (matchingSegment) return matchingSegment;

        const isHome = u.pathname === '/' || u.pathname === '';
        if (isHome) {
          return segments[0];
        } else {
          return segments[segments.length - 1];
        }
      }
      return u.hostname.replace('www.', '');
    } catch {
      return segments[0] || 'Site Owner';
    }
  };
  const brandName = getBrandName();

  // Resolve publisher logo
  let logoUrl = imageUrl;

  if (indexMarkdown) {
    const { fields: indexFields, body: indexBody } = parseFrontmatterFieldsSafe(indexMarkdown);
    let homepageLogo = indexFields['logo'] || indexFields['image'] || indexFields['ogImage'];
    if (!homepageLogo && indexBody) {
      const mdMatch = indexBody.match(/!\[.*?\]\((.*?)\)/);
      if (mdMatch && mdMatch[1]) {
        homepageLogo = mdMatch[1];
      } else {
        const htmlMatch = indexBody.match(/<img\s+[^>]*?src=["'](.*?)["']/i);
        if (htmlMatch && htmlMatch[1]) {
          homepageLogo = htmlMatch[1];
        }
      }
    }

    if (homepageLogo) {
      homepageLogo = homepageLogo.trim().replace(/^['"]|['"]$/g, '');
      if (!homepageLogo.startsWith('http://') && !homepageLogo.startsWith('https://')) {
        if (brandUrl) {
          const cleanPath = homepageLogo.startsWith('/') ? homepageLogo : `/${homepageLogo}`;
          homepageLogo = `${brandUrl}${cleanPath}`;
        }
      }
      logoUrl = homepageLogo;
    }
  }

  if (!logoUrl || logoUrl.includes('favicon.ico')) {
    if (brandUrl) {
      if (brandUrl.includes('aiready.cat')) {
        logoUrl = `${brandUrl}/logo-v4.png`;
      } else {
        logoUrl = `${brandUrl}/logo.png`;
      }
    } else {
      logoUrl = undefined;
    }
  }

  const publisher = {
    '@type': 'Organization',
    name: brandName,
    ...(brandUrl ? { url: brandUrl } : {}),
    ...(logoUrl ? {
      logo: {
        '@type': 'ImageObject',
        url: logoUrl,
      },
    } : {}),
  };

  // Build the specific JSON-LD shape based on type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let jsonLd: Record<string, any> = {
    '@context': 'https://schema.org',
    '@type': schemaType,
  };

  if (schemaType === 'BlogPosting') {
    jsonLd = {
      ...jsonLd,
      headline: title,
      description: description,
      url: canonical,
      mainEntityOfPage: {
        '@type': 'WebPage',
        '@id': canonical,
      },
      ...(imageUrl ? { image: imageUrl } : {}),
      ...(dateModified ? { datePublished: dateModified, dateModified } : {}),
      author: {
        '@type': 'Organization',
        name: brandName,
      },
      publisher,
    };
  } else if (schemaType === 'Product') {
    jsonLd = {
      ...jsonLd,
      name: title,
      description: description,
      url: canonical,
      ...(imageUrl ? { image: imageUrl } : {}),
      brand: {
        '@type': 'Brand',
        name: brandName,
      },
    };
  } else if (schemaType === 'Place') {
    jsonLd = {
      ...jsonLd,
      name: title,
      description: description,
      url: canonical,
      ...(imageUrl ? { image: imageUrl } : {}),
    };
  } else if (schemaType === 'JobPosting') {
    jsonLd = {
      ...jsonLd,
      title: title,
      description: description,
      url: canonical,
      hiringOrganization: {
        '@type': 'Organization',
        name: brandName,
        ...(brandUrl ? { url: brandUrl } : {}),
      },
      ...(dateModified ? { datePosted: dateModified } : {}),
    };
  } else {
    // Default WebPage / AboutPage / ContactPage / Menu
    jsonLd = {
      ...jsonLd,
      name: title,
      description: description,
      url: canonical,
      ...(imageUrl ? { image: imageUrl } : {}),
      publisher,
    };
  }

  // Add abstract/summary if available and type is not Place/Product (which don't use abstract)
  if (fields['summary'] && schemaType !== 'Place' && schemaType !== 'Product') {
    jsonLd.abstract = fields['summary'];
  }

  return JSON.stringify(jsonLd, null, 2);
}
