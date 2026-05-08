import Link from 'next/link';
import { requireUser } from '@/lib/auth-guards';
import { SignOutButton } from '@/components/auth/sign-out-button';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-hairline">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-6">
          <Link href="/dashboard" className="display-sm text-ink">
            make-a-llms.txt
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-body">{user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1200px] px-6 py-12">{children}</main>
    </div>
  );
}
