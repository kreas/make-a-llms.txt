import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { SignOutButton } from '@/components/auth/sign-out-button';

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto flex min-h-screen max-w-[1200px] flex-col items-center justify-center px-6 py-20">
      <div className="flex flex-col items-center gap-10 text-center">
        <h1 className="display-mega text-ink">AI Starter Pack</h1>

        {user ? (
          <div className="flex flex-col items-center gap-6">
            <p className="text-body">
              Signed in as <span className="text-ink">{user.email}</span>
            </p>
            <SignOutButton />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6">
            <p className="max-w-prose text-body">Get started by signing in.</p>
            <div className="flex gap-3">
              <Link
                href="/signup"
                className="inline-flex h-11 items-center justify-center rounded-lg bg-ink px-5 text-sm font-medium text-canvas transition-colors hover:bg-ink/90"
              >
                Sign up
              </Link>
              <Link
                href="/signin"
                className="inline-flex h-11 items-center justify-center rounded-lg border border-hairline-strong bg-surface-card px-5 text-sm font-medium text-ink transition-colors hover:bg-canvas-soft"
              >
                Sign in
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
