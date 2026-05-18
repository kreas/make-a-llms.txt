import { getMergedPageTree } from '@/lib/docs/source';
import { getCurrentUser } from '@/lib/auth';
import { DocsLayoutShell } from '@/components/layout/docs-layout-shell';

export default async function Layout({ children }: { children: React.ReactNode }) {
  const [tree, user] = await Promise.all([getMergedPageTree(), getCurrentUser()]);
  return (
    <DocsLayoutShell tree={tree} authenticated={!!user}>
      {children}
    </DocsLayoutShell>
  );
}
