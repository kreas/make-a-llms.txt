import Image from 'next/image';
import { DocsLayout } from 'fumadocs-ui/layouts/notebook';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { getMergedPageTree } from '@/lib/docs/source';
import { getCurrentUser } from '@/lib/auth';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const [tree, user] = await Promise.all([getMergedPageTree(), getCurrentUser()]);
  const ctaUrl = user ? '/settings/api-tokens' : '/signup';
  return (
    <RootProvider
      theme={{
        defaultTheme: 'light',
        forcedTheme: 'light',
        enableSystem: false,
      }}
    >
      <DocsLayout
        tree={tree}
        nav={{
          title: (
            <span className="flex items-center gap-2 text-ink">
              <Image
                src="/logo.webp"
                alt=""
                width={28}
                height={28}
                className="h-7 w-7 shrink-0 rounded-md"
                priority
              />
              <span className="display-sm">AI Ready</span>
            </span>
          ),
          url: '/',
          mode: 'top',
        }}
        themeSwitch={{ enabled: false }}
        links={[
          { text: 'Docs', url: '/docs', active: 'nested-url' },
          { type: 'button', text: 'Get an API key', url: ctaUrl },
        ]}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
