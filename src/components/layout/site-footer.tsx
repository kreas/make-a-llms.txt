import Link from 'next/link';

const RESOURCE_LINKS = [
  { href: '/docs/privacy', label: 'Privacy' },
  { href: '/docs/terms', label: 'Terms' },
  { href: '/docs/security', label: 'Security' },
] as const;

const COMMUNITY_LINKS = [
  { href: 'https://github.com', label: 'GitHub' },
  { href: '#', label: 'Status' },
] as const;

const LINK_CLASS =
  'font-mono text-[13px] text-ink/75 underline decoration-ink/20 transition-colors hover:text-ink hover:decoration-ink';

export function SiteFooter() {
  return (
    <footer className="relative border-t border-black/10 bg-gradient-to-tr from-[#efc466] to-[#F64E00] text-ink">
      <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-8 px-6 pt-20 pb-20 md:py-20 md:grid-cols-2">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <img
              src="/logo-v4.png"
              alt=""
              width={40}
              height={40}
              className="h-10 w-10 rounded-md object-contain"
            />
            <span className="display-sm text-ink">AI Ready</span>
          </div>
          <p className="max-w-sm font-mono text-[13px] text-ink/75">
            © {new Date().getFullYear()} AI Ready. Built for the next billion builders.
            Empowering the Agent Era with high-fidelity context.
          </p>
        </div>
        <div className="flex flex-wrap gap-12 md:justify-end">
          <div className="flex flex-col gap-2">
            <h4 className="caption-uppercase mb-1 text-ink font-semibold opacity-90">Resources</h4>
            {RESOURCE_LINKS.map(({ href, label }) => (
              <Link key={label} href={href} className={LINK_CLASS}>
                {label}
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <h4 className="caption-uppercase mb-1 text-ink font-semibold opacity-90">Community</h4>
            {COMMUNITY_LINKS.map(({ href, label }) => (
              <Link key={label} href={href} className={LINK_CLASS}>
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
      <img
        src="/footer-cat-v2.png"
        alt=""
        className="absolute bottom-0 left-0 h-14 w-14 object-contain pointer-events-none md:h-20 md:w-20"
      />
    </footer>
  );
}
