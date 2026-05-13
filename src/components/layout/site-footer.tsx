import Link from 'next/link';

const LINKS = [
  { href: '#', label: 'Privacy' },
  { href: '#', label: 'Terms' },
  { href: 'https://github.com', label: 'GitHub' },
  { href: '/documentation', label: 'API Documentation' },
] as const;

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-12 w-full border-t border-hairline bg-canvas">
      <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-4 px-6 py-8 md:flex-row">
        <div className="font-mono text-[13px] text-ink">
          © {year} AI READY. BUILT FOR BUILDERS.
        </div>
        <div className="flex gap-6">
          {LINKS.map(({ href, label }) => (
            <Link
              key={label}
              href={href}
              className="caption-uppercase text-muted-strong transition-colors hover:text-ink hover:underline"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
