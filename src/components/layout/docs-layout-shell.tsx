'use client';

import { DocsLayout } from 'fumadocs-ui/layouts/notebook';
import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ComponentProps, ReactNode } from 'react';
import type * as PageTree from 'fumadocs-core/page-tree';
import { DocsHeader } from '@/components/layout/docs-header';
import { SiteFooter } from '@/components/layout/site-footer';

type Props = {
  tree: PageTree.Root;
  authenticated: boolean;
  children: ReactNode;
};

export function DocsLayoutShell({ tree, authenticated, children }: Props) {
  const HeaderSlot = (headerProps: ComponentProps<'header'>) => (
    <DocsHeader authenticated={authenticated} {...headerProps} />
  );
  return (
    <RootProvider theme={{ enabled: false }}>
      <DocsLayout
        tree={tree}
        nav={{ mode: 'top' }}
        sidebar={{ collapsible: false }}
        themeSwitch={{ enabled: false }}
        slots={{ header: HeaderSlot }}
        containerProps={{
          style: { '--fd-header-height': '72px' } as React.CSSProperties,
        }}
      >
        {children}
      </DocsLayout>
      <SiteFooter />
    </RootProvider>
  );
}
