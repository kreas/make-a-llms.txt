import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <main className="mx-auto flex min-h-screen max-w-[1200px] flex-col items-center justify-center px-6 py-20">
      <div className="flex flex-col items-center gap-10 text-center">
        <h1 className="display-mega text-ink">make-a-llms.txt</h1>
        <p className="max-w-prose text-body">
          Generate <code className="font-mono">llms.txt</code> and{' '}
          <code className="font-mono">llms-full.txt</code> for any site from its sitemap. We do not
          store your site&apos;s content — only the generated text files for your re-download.
        </p>
        <div className="flex gap-3">
          {user ? (
            <Link
              href="/dashboard"
              className="inline-flex h-11 items-center rounded-lg bg-primary px-5 text-sm text-canvas"
            >
              Open dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/signup"
                className="inline-flex h-11 items-center rounded-lg bg-primary px-5 text-sm text-canvas"
              >
                Sign up
              </Link>
              <Link
                href="/signin"
                className="inline-flex h-11 items-center rounded-lg border border-hairline-strong bg-surface-card px-5 text-sm text-ink"
              >
                Sign in
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
