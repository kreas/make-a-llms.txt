import Link from 'next/link';

const RESOURCE_LINKS = [
  { href: '#', label: 'Privacy' },
  { href: '#', label: 'Terms' },
  { href: '/documentation', label: 'Security' },
] as const;

const COMMUNITY_LINKS = [
  { href: 'https://github.com', label: 'GitHub' },
  { href: '#', label: 'Status' },
] as const;

const LINK_CLASS =
  'font-mono text-[13px] text-white/80 underline decoration-white/30 transition-colors hover:text-white hover:decoration-white';

export function SiteFooter() {
  return (
    <footer className="border-t border-primary-active bg-primary text-white">
      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-8 px-6 py-20 md:grid-cols-2">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <img
              src="/logo.webp"
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 rounded-md bg-white p-1 object-contain"
            />
            <span className="display-sm text-white">AI Ready</span>
          </div>
          <p className="max-w-sm font-mono text-[13px] text-white/80">
            © {new Date().getFullYear()} AI Ready. Built for the next billion builders.
            Empowering the Agent Era with high-fidelity context.
          </p>
        </div>
        <div className="flex flex-wrap gap-12 md:justify-end">
          <div className="flex flex-col gap-2">
            <h4 className="caption-uppercase mb-1 text-white font-medium opacity-90">Resources</h4>
            {RESOURCE_LINKS.map(({ href, label }) => (
              <Link key={label} href={href} className={LINK_CLASS}>
                {label}
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <h4 className="caption-uppercase mb-1 text-white font-medium opacity-90">Community</h4>
            {COMMUNITY_LINKS.map(({ href, label }) => (
              <Link key={label} href={href} className={LINK_CLASS}>
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
