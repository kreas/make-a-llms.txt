import { requireUser } from '@/lib/auth-guards';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink isolate overflow-x-hidden">
      <SiteHeader />
      <main className="relative mx-auto w-full max-w-[1200px] flex-grow px-6 py-20">{children}</main>
      <SiteFooter />
    </div>
  );
}
