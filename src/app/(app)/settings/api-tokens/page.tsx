import { requireUser } from '@/lib/auth-guards';
import { ApiTokensClient } from './api-tokens-client';

export default async function ApiTokensPage() {
  await requireUser();
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <header>
        <h1 className="display-lg text-ink">API tokens</h1>
        <p className="mt-2 text-base text-muted-strong">
          Create personal access tokens to use the public API.
        </p>
      </header>
      <ApiTokensClient />
    </div>
  );
}
