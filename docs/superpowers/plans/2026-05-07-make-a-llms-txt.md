# make-a-llms.txt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a signed-in web app that generates `llms.txt` and `llms-full.txt` for a user's website using the `llmstxt` npm package, with durable Vercel Workflow execution, per-site webhook regeneration, and Resend email notifications.

**Architecture:** Next.js 16 App Router on top of the existing AI starter pack. Two new tables (`sites`, `generations`). One Vercel Workflow (parallel `runGen` + `runFull` steps). Authed REST + SSE for the in-app UX; token-authed webhook for external triggers. Files stored in Vercel Blob, served through an authed proxy.

**Tech Stack:** Next.js 16, TypeScript, Drizzle + Turso (libsql), `@vercel/blob`, `@vercel/workflow`, `execa`, `llmstxt`, `resend`, `jose`, Tailwind v4 + ShadCN UI, TanStack Query, Vitest + RTL.

**Reference spec:** `docs/superpowers/specs/2026-05-07-make-a-llms-txt-design.md` (commit `a49707e`).

---

## Phases

1. Foundation (deps, cleanup, theme bridge, schema, test infra) — Tasks 1–5
2. Utility libs (with tests) — Tasks 6–10
3. Workflow (WDK) — Tasks 11–13
4. Convergence helper — Task 14
5. API routes (sites, generations, webhook) — Tasks 15–23
6. UI components (with tests) — Tasks 24–30
7. Pages — Tasks 31–35
8. Ops + final verification — Tasks 36–38

---

## Phase 1 — Foundation

### Task 1: Install runtime dependencies

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Install runtime deps**

```bash
pnpm add llmstxt execa workflow @vercel/blob nanoid
```

`@vercel/blob` is already present — pnpm will no-op or upgrade. `llmstxt` is the generation engine; `execa` runs it; `workflow` is the Vercel Workflow DevKit (WDK); `nanoid` mints webhook tokens.

> **WDK package name**: this plan imports from `'workflow'` and `'workflow/api'`. If the executor finds the package is published under a different name (e.g., `@vercel/workflow`), change the imports in `src/lib/workflow/wdk.ts` only — the rest of the code uses that adapter.

- [ ] **Step 2: Verify the binary is reachable**

Run:
```bash
ls node_modules/.bin/llmstxt && node_modules/.bin/llmstxt --help | head -5
```
Expected: lists `node_modules/.bin/llmstxt` and prints help text mentioning `gen` and `gen-full` subcommands.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add llmstxt, execa, workflow, nanoid deps"
```

---

### Task 2: Remove the unrelated chat scaffold

**Files:**
- Delete: `src/app/api/chat/` (recursively)

- [ ] **Step 1: Confirm what's there**

```bash
ls src/app/api/chat/
```
Expected: shows `route.ts` (and possibly nested files).

- [ ] **Step 2: Delete the directory**

```bash
git rm -r src/app/api/chat
```

- [ ] **Step 3: Build to confirm no dangling imports**

```bash
pnpm build
```
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove unused chat API scaffold"
```

---

### Task 3: Add `--color-semantic-success` Tailwind bridge

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Add the bridge inside `@theme inline`**

Add this single line in the `@theme inline { ... }` block in `src/app/globals.css`, alongside the other `--color-*` declarations (e.g., right after `--color-timeline-done`):

```css
  --color-semantic-success: var(--semantic-success);
```

- [ ] **Step 2: Verify by adding a smoke usage**

Open `src/app/page.tsx` and temporarily add a `<span className="bg-semantic-success">test</span>` element, then:

```bash
pnpm dev
```
Open http://localhost:3000 and confirm the element renders with green background `#1f8a65`. Then **remove** the temporary element.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(theme): bridge semantic-success token to Tailwind"
```

---

### Task 4: Add `sites` and `generations` tables to schema + migrate

**Files:**
- Modify: `src/db/schema.ts`
- Generate: `drizzle/<timestamp>_*.sql` (via `pnpm db:generate`)

- [ ] **Step 1: Append to `src/db/schema.ts`**

Append after the existing `otpCodes` table:

```ts
import { index, unique } from 'drizzle-orm/sqlite-core';

export const sites = sqliteTable(
  'sites',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    rootUrl: text('root_url').notNull(),
    sitemapUrl: text('sitemap_url'),
    webhookTokenHash: text('webhook_token_hash').notNull().unique(),
    webhookTokenPrefix: text('webhook_token_prefix').notNull(),
    lastGeneratedAt: text('last_generated_at'),
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
    updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
  },
  (t) => ({
    uniqueUserRoot: unique('sites_user_root_unique').on(t.userId, t.rootUrl),
  }),
);

export const generations = sqliteTable(
  'generations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    siteId: integer('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status', {
      enum: ['pending', 'running', 'succeeded', 'failed', 'cancelled'],
    })
      .notNull()
      .default('pending'),
    trigger: text('trigger', { enum: ['manual', 'webhook'] }).notNull(),
    notifyEmail: integer('notify_email', { mode: 'boolean' }).notNull().default(false),
    notifiedAt: text('notified_at'),
    workflowRunId: text('workflow_run_id'),
    resolvedSitemapUrl: text('resolved_sitemap_url'),
    llmsBlobPath: text('llms_blob_path'),
    llmsFullBlobPath: text('llms_full_blob_path'),
    errorMessage: text('error_message'),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
    updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
  },
  (t) => ({
    bySiteRecent: index('gen_by_site_recent').on(t.siteId, t.createdAt),
  }),
);

export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;
export type Generation = typeof generations.$inferSelect;
export type NewGeneration = typeof generations.$inferInsert;
```

- [ ] **Step 2: Generate migration**

```bash
pnpm db:generate
```
Expected: a new file appears in `drizzle/` named like `0001_*.sql` containing `CREATE TABLE sites …` and `CREATE TABLE generations …`.

- [ ] **Step 3: Apply migration**

```bash
pnpm db:migrate
```
Expected: prints applied-migrations log. No errors.

- [ ] **Step 4: Smoke check**

```bash
pnpm db:studio
```
Open the URL it prints; confirm `sites` and `generations` tables exist with the expected columns. Close studio.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat(db): add sites and generations tables"
```

---

### Task 5: Test infrastructure — in-memory DB helper + base mocks

**Files:**
- Create: `src/test/db.ts`
- Create: `src/test/mocks/blob.ts`
- Create: `src/test/mocks/execa.ts`
- Create: `src/test/mocks/resend.ts`
- Create: `src/test/mocks/workflow.ts`
- Modify: `src/test/setup.ts` (add `vi.unstubAllEnvs` cleanup)
- Modify: `src/db/index.ts` (add a test-only override)

- [ ] **Step 1: Add test-only override to db client**

Replace `src/db/index.ts` with:

```ts
import { drizzle } from 'drizzle-orm/libsql';
import type { Client } from '@libsql/client';

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db) {
    _db = drizzle({
      connection: {
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN!,
      },
    });
  }
  return _db;
}

/** Test-only: inject a pre-built drizzle client. Resets in-memory cache. */
export function __setDbForTests(client: ReturnType<typeof drizzle> | null) {
  _db = client;
}

export type Db = ReturnType<typeof drizzle>;
```

- [ ] **Step 2: Create the in-memory DB helper**

Create `src/test/db.ts`:

```ts
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { __setDbForTests } from '@/db';
import path from 'node:path';

export type TestDb = ReturnType<typeof drizzle>;

export async function setupTestDb(): Promise<TestDb> {
  const client = createClient({ url: ':memory:' });
  const db = drizzle(client);
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, '../../drizzle'),
  });
  __setDbForTests(db);
  return db;
}

export function resetTestDb() {
  __setDbForTests(null);
}
```

- [ ] **Step 3: Create mocks**

`src/test/mocks/blob.ts`:

```ts
import { vi } from 'vitest';

export const blobStore = new Map<string, string>();

export function mockBlob() {
  return vi.mock('@vercel/blob', () => ({
    put: vi.fn(async (pathname: string, body: any) => {
      const text = typeof body === 'string' ? body : await readToString(body);
      blobStore.set(pathname, text);
      return {
        url: `https://blob.test/${pathname}`,
        pathname,
        contentType: 'text/plain',
        contentDisposition: '',
      };
    }),
    del: vi.fn(async (url: string) => {
      const path = url.replace('https://blob.test/', '');
      blobStore.delete(path);
    }),
    head: vi.fn(async (url: string) => ({
      url,
      pathname: url.replace('https://blob.test/', ''),
      size: blobStore.get(url.replace('https://blob.test/', ''))?.length ?? 0,
      contentType: 'text/plain',
    })),
    list: vi.fn(async () => ({ blobs: [...blobStore.keys()].map((p) => ({ pathname: p })) })),
  }));
}

async function readToString(body: any): Promise<string> {
  if (body instanceof ReadableStream) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let out = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      out += decoder.decode(value, { stream: true });
    }
    return out + decoder.decode();
  }
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  if (Buffer.isBuffer(body)) return body.toString('utf8');
  return String(body);
}
```

`src/test/mocks/execa.ts`:

```ts
import { vi } from 'vitest';
import { Readable } from 'node:stream';

export type FakeExecaResult = { stdout: string; stderr?: string; exitCode?: number };

export function mockExeca(handler: (args: string[]) => FakeExecaResult) {
  return vi.mock('execa', () => ({
    execa: vi.fn((_bin: string, args: string[]) => {
      const { stdout, stderr = '', exitCode = 0 } = handler(args);
      const stream = Readable.from([Buffer.from(stdout)]);
      const promise: any = Promise.resolve({ stdout, stderr, exitCode });
      promise.stdout = stream;
      promise.stderr = Readable.from([Buffer.from(stderr)]);
      return promise;
    }),
  }));
}
```

`src/test/mocks/resend.ts`:

```ts
import { vi } from 'vitest';

export const sentEmails: Array<{ to: string; subject: string; html: string }> = [];

export function mockResend() {
  sentEmails.length = 0;
  return vi.mock('resend', () => ({
    Resend: vi.fn().mockImplementation(() => ({
      emails: {
        send: vi.fn(async ({ to, subject, html }: any) => {
          sentEmails.push({ to, subject, html });
          return { data: { id: 'test-' + Math.random() }, error: null };
        }),
      },
    })),
  }));
}
```

`src/test/mocks/workflow.ts`:

```ts
import { vi } from 'vitest';

/**
 * In-process synchronous step runner. Each step.run(name, fn) just calls fn().
 * Step.parallel runs in Promise.all. Errors propagate so workflow tests can assert.
 */
export function mockWorkflow() {
  return vi.mock('@vercel/workflow', () => {
    const stepRun = async (_name: string, fn: () => Promise<any>) => fn();
    const stepParallel = async (...promises: Array<() => Promise<any>>) =>
      Promise.all(promises.map((p) => p()));
    return {
      workflow: (_name: string, fn: any) => fn,
      step: { run: stepRun, parallel: stepParallel },
      startWorkflow: vi.fn(async () => ({ runId: 'test-run-' + Math.random() })),
      cancelWorkflow: vi.fn(async () => true),
    };
  });
}
```

- [ ] **Step 4: Add env-stub teardown to setup**

Update `src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { resetTestDb } from './db';

afterEach(() => {
  cleanup();
  resetTestDb();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof document !== 'undefined' && typeof document.elementFromPoint !== 'function') {
  document.elementFromPoint = () => null;
}
```

- [ ] **Step 5: Smoke test the helper**

Create `src/test/db.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { setupTestDb } from './db';
import { sites, users } from '@/db/schema';
import { getDb } from '@/db';

describe('test db helper', () => {
  it('migrates schema and round-trips a row', async () => {
    await setupTestDb();
    const db = getDb();

    const [u] = await db.insert(users).values({ name: 'T', email: 't@t.test' }).returning();
    const [s] = await db.insert(sites).values({
      userId: u.id,
      name: 'Test',
      rootUrl: 'https://test.example',
      webhookTokenHash: 'a'.repeat(64),
      webhookTokenPrefix: 'lmt_aaaa',
    }).returning();

    expect(s.id).toBeGreaterThan(0);
    expect(s.userId).toBe(u.id);
  });
});
```

- [ ] **Step 6: Run the smoke test**

```bash
pnpm test src/test/db.test.ts
```
Expected: 1 passed.

- [ ] **Step 7: Commit**

```bash
git add src/test/ src/db/index.ts
git commit -m "test: in-memory libsql helper and base mocks"
```

---

## Phase 2 — Utility libs (with tests)

### Task 6: `webhook-token` — generate, hash, verify, prefix

**Files:**
- Create: `src/lib/webhook-token.ts`
- Create: `src/lib/webhook-token.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/webhook-token.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createWebhookToken, hashToken, verifyToken } from './webhook-token';

describe('webhook-token', () => {
  it('createWebhookToken returns token, hash, and prefix; token is reasonably long', () => {
    const t = createWebhookToken();
    expect(t.token).toMatch(/^lmt_/);
    expect(t.token.length).toBeGreaterThanOrEqual(36);
    expect(t.hash).toHaveLength(64); // sha256 hex
    expect(t.prefix.length).toBe(8);
    expect(t.token.startsWith(t.prefix)).toBe(true);
  });

  it('hashToken is deterministic', () => {
    expect(hashToken('lmt_abcdefg')).toBe(hashToken('lmt_abcdefg'));
  });

  it('verifyToken matches by hash', () => {
    const { token, hash } = createWebhookToken();
    expect(verifyToken(token, hash)).toBe(true);
    expect(verifyToken('lmt_wrong', hash)).toBe(false);
  });

  it('verifyToken is constant-time (no early exit on mismatch)', () => {
    // Smoke: not a perf assertion. Just ensure it does not throw on length mismatch.
    expect(verifyToken('short', 'a'.repeat(64))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, expect fail**

```bash
pnpm test src/lib/webhook-token.test.ts
```
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/webhook-token.ts`:

```ts
import { createHash, timingSafeEqual } from 'node:crypto';
import { nanoid } from 'nanoid';

export type WebhookTokenParts = {
  token: string;
  hash: string;
  prefix: string;
};

export function createWebhookToken(): WebhookTokenParts {
  const token = `lmt_${nanoid(32)}`;
  const hash = hashToken(token);
  const prefix = token.slice(0, 8);
  return { token, hash, prefix };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function verifyToken(presented: string, storedHash: string): boolean {
  const presentedHash = hashToken(presented);
  if (presentedHash.length !== storedHash.length) return false;
  return timingSafeEqual(Buffer.from(presentedHash), Buffer.from(storedHash));
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
pnpm test src/lib/webhook-token.test.ts
```
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/webhook-token.ts src/lib/webhook-token.test.ts
git commit -m "feat(webhook-token): generate, hash, and verify tokens"
```

---

### Task 7: `sitemap-discover` — autodiscover sitemap from a root URL

**Files:**
- Create: `src/lib/sitemap-discover.ts`
- Create: `src/lib/sitemap-discover.test.ts`

> **Note on retries**: `discoverSitemap` itself does **not** retry — it makes one attempt at each candidate URL. Retries are configured at the WDK step level (`prepareStep` is wrapped by `step.run('prepare', ..., { retries: 3, backoff: 'exponential' })` in Task 13's adapter, see WDK docs). This keeps the function pure-Node and avoids `setTimeout` in any code path that may execute in workflow scope.

- [ ] **Step 1: Write failing tests**

Create `src/lib/sitemap-discover.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { discoverSitemap } from './sitemap-discover';

describe('discoverSitemap', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFetch(map: Record<string, { status: number; body?: string }>) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const m = map[url];
        if (!m) return new Response('', { status: 404 });
        return new Response(m.body ?? '', { status: m.status });
      }),
    );
  }

  it('returns /sitemap.xml when present', async () => {
    mockFetch({
      'https://x.test/sitemap.xml': { status: 200, body: '<urlset><url><loc>x</loc></url></urlset>' },
    });
    expect(await discoverSitemap('https://x.test')).toBe('https://x.test/sitemap.xml');
  });

  it('falls back to /sitemap_index.xml', async () => {
    mockFetch({
      'https://x.test/sitemap.xml': { status: 404 },
      'https://x.test/sitemap_index.xml': { status: 200, body: '<sitemapindex></sitemapindex>' },
    });
    expect(await discoverSitemap('https://x.test')).toBe('https://x.test/sitemap_index.xml');
  });

  it('falls back to robots.txt Sitemap directive', async () => {
    mockFetch({
      'https://x.test/sitemap.xml': { status: 404 },
      'https://x.test/sitemap_index.xml': { status: 404 },
      'https://x.test/robots.txt': {
        status: 200,
        body: 'User-agent: *\nSitemap: https://x.test/custom-sitemap.xml\n',
      },
      'https://x.test/custom-sitemap.xml': { status: 200, body: '<urlset></urlset>' },
    });
    expect(await discoverSitemap('https://x.test')).toBe('https://x.test/custom-sitemap.xml');
  });

  it('throws when nothing is found', async () => {
    mockFetch({});
    await expect(discoverSitemap('https://x.test')).rejects.toThrow(/No sitemap/);
  });
});
```

- [ ] **Step 2: Run test, expect fail**

```bash
pnpm test src/lib/sitemap-discover.test.ts
```
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/sitemap-discover.ts`. **This module is invoked only inside a "use step" function** (see `prepareStep` in Task 12). Inside step scope, `fetch` is real Node.js `fetch`. WDK provides retry/backoff at the step boundary, so this function makes a single attempt per candidate URL and throws on miss — no internal retry loop, no `setTimeout`. Logs at entry/exit for observability.

```ts
'use step';

export async function discoverSitemap(rootUrl: string): Promise<string> {
  console.log(`[sitemap-discover] start root=${rootUrl}`);
  const root = rootUrl.replace(/\/$/, '');

  const candidates = [`${root}/sitemap.xml`, `${root}/sitemap_index.xml`];
  for (const url of candidates) {
    const res = await safeFetch(url);
    if (res?.ok) {
      console.log(`[sitemap-discover] hit ${url}`);
      return url;
    }
  }

  const robotsRes = await safeFetch(`${root}/robots.txt`);
  if (robotsRes?.ok) {
    const body = await robotsRes.text();
    const match = body.match(/^\s*Sitemap:\s*(\S+)\s*$/im);
    if (match) {
      const fromRobots = match[1];
      const res = await safeFetch(fromRobots);
      if (res?.ok) {
        console.log(`[sitemap-discover] hit (via robots) ${fromRobots}`);
        return fromRobots;
      }
    }
  }

  console.error(`[sitemap-discover] miss for ${root}`);
  throw new Error('No sitemap found. Add a sitemap URL on the site page.');
}

async function safeFetch(url: string): Promise<Response | null> {
  try {
    return await fetch(url);
  } catch {
    return null;
  }
}
```

The `'use step'` directive marks this module as step-scope only — the file is never imported from workflow scope.

- [ ] **Step 4: Run test, expect pass**

```bash
pnpm test src/lib/sitemap-discover.test.ts
```
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sitemap-discover.ts src/lib/sitemap-discover.test.ts
git commit -m "feat(sitemap-discover): single-pass discovery; retries owned by WDK step"
```

---

### Task 8: Zod validators (sites, generations, webhook)

**Files:**
- Create: `src/lib/validators.ts`
- Create: `src/lib/validators.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/validators.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  createSiteSchema,
  updateSiteSchema,
  createGenerationSchema,
  webhookBodySchema,
  normalizeRootUrl,
} from './validators';

describe('validators', () => {
  it('normalizeRootUrl returns lowercase origin without path', () => {
    expect(normalizeRootUrl('https://Example.COM/path?q=1')).toBe('https://example.com');
    expect(normalizeRootUrl('https://example.com/')).toBe('https://example.com');
  });

  it('createSiteSchema accepts valid input and normalizes rootUrl', () => {
    const out = createSiteSchema.parse({
      name: 'Acme',
      rootUrl: 'https://Acme.com/path',
      sitemapUrl: 'https://acme.com/sitemap.xml',
    });
    expect(out.rootUrl).toBe('https://acme.com');
  });

  it('createSiteSchema rejects http-less url', () => {
    expect(() => createSiteSchema.parse({ name: 'A', rootUrl: 'acme.com' })).toThrow();
  });

  it('createSiteSchema rejects empty / overlong name', () => {
    expect(() => createSiteSchema.parse({ name: '', rootUrl: 'https://a.test' })).toThrow();
    expect(() =>
      createSiteSchema.parse({ name: 'x'.repeat(81), rootUrl: 'https://a.test' }),
    ).toThrow();
  });

  it('updateSiteSchema accepts partial updates', () => {
    expect(updateSiteSchema.parse({ name: 'New' })).toEqual({ name: 'New' });
    expect(updateSiteSchema.parse({})).toEqual({});
  });

  it('createGenerationSchema accepts siteId-shape', () => {
    const out = createGenerationSchema.parse({ siteId: 7, notifyEmail: true });
    expect(out).toEqual({ siteId: 7, notifyEmail: true });
  });

  it('createGenerationSchema accepts inline-site-shape', () => {
    const out = createGenerationSchema.parse({
      name: 'Acme',
      rootUrl: 'https://Acme.com',
    });
    expect((out as any).rootUrl).toBe('https://acme.com');
  });

  it('createGenerationSchema rejects mixed shape', () => {
    expect(() =>
      createGenerationSchema.parse({
        siteId: 1,
        name: 'A',
        rootUrl: 'https://a.test',
      } as any),
    ).toThrow();
  });

  it('webhookBodySchema strips unknown keys including notify', () => {
    const out = webhookBodySchema.parse({ notify: true, weird: 'x' });
    expect(out).toEqual({});
  });
});
```

- [ ] **Step 2: Run test, expect fail**

```bash
pnpm test src/lib/validators.test.ts
```
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/validators.ts`:

```ts
import { z } from 'zod';

export function normalizeRootUrl(input: string): string {
  const u = new URL(input);
  return `${u.protocol}//${u.host.toLowerCase()}`;
}

const httpUrl = z
  .string()
  .url()
  .refine((u) => /^https?:\/\//i.test(u), 'must start with http:// or https://');

export const createSiteSchema = z
  .object({
    name: z.string().min(1).max(80),
    rootUrl: httpUrl,
    sitemapUrl: httpUrl.optional(),
  })
  .transform((v) => ({ ...v, rootUrl: normalizeRootUrl(v.rootUrl) }));

export const updateSiteSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  sitemapUrl: httpUrl.nullable().optional(),
});

const generationFromSiteId = z.object({
  siteId: z.number().int().positive(),
  notifyEmail: z.boolean().optional(),
});

const generationFromInlineSite = z
  .object({
    name: z.string().min(1).max(80),
    rootUrl: httpUrl,
    sitemapUrl: httpUrl.optional(),
    notifyEmail: z.boolean().optional(),
  })
  .transform((v) => ({ ...v, rootUrl: normalizeRootUrl(v.rootUrl) }));

export const createGenerationSchema = z.union([
  generationFromSiteId.strict(),
  generationFromInlineSite,
]);

export const webhookBodySchema = z.object({}).strip();

export type CreateSiteInput = z.infer<typeof createSiteSchema>;
export type UpdateSiteInput = z.infer<typeof updateSiteSchema>;
export type CreateGenerationInput = z.infer<typeof createGenerationSchema>;
```

- [ ] **Step 4: Run test, expect pass**

```bash
pnpm test src/lib/validators.test.ts
```
Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validators.ts src/lib/validators.test.ts
git commit -m "feat(validators): zod schemas for sites, generations, webhook"
```

---

### Task 9: `auth-guards` — `requireUser`, ownership helpers

**Files:**
- Create: `src/lib/auth-guards.ts`
- Create: `src/lib/auth-guards.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/auth-guards.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { sites, users } from '@/db/schema';
import { getDb } from '@/db';
import { assertOwnsSite, ApiError } from './auth-guards';

describe('auth-guards', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  it('assertOwnsSite returns the site for the owner', async () => {
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const [s] = await db
      .insert(sites)
      .values({
        userId: u.id,
        name: 'S',
        rootUrl: 'https://s.test',
        webhookTokenHash: 'a'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();

    const found = await assertOwnsSite(s.id, u.id);
    expect(found.id).toBe(s.id);
  });

  it('assertOwnsSite throws 404 for a different user', async () => {
    const db = getDb();
    const [u1] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const [u2] = await db.insert(users).values({ name: 'B', email: 'b@b.test' }).returning();
    const [s] = await db
      .insert(sites)
      .values({
        userId: u1.id,
        name: 'S',
        rootUrl: 'https://s.test',
        webhookTokenHash: 'a'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();

    await expect(assertOwnsSite(s.id, u2.id)).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
    });
  });

  it('assertOwnsSite throws 404 for missing site', async () => {
    await expect(assertOwnsSite(99999, 1)).rejects.toMatchObject({ status: 404 });
  });

  it('ApiError carries status and code', () => {
    const e = new ApiError(401, 'unauthenticated', 'Sign in required');
    expect(e.status).toBe(401);
    expect(e.code).toBe('unauthenticated');
    expect(e.message).toBe('Sign in required');
  });
});
```

- [ ] **Step 2: Run test, expect fail**

```bash
pnpm test src/lib/auth-guards.test.ts
```
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/auth-guards.ts`:

```ts
import { eq, and } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getDb } from '@/db';
import { sites, generations, type Site, type Generation } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Server-component guard: redirects to /signin if unauthenticated. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/signin');
  }
  return user;
}

/** API-route guard: throws ApiError(401) if unauthenticated. */
export async function requireUserOrThrow() {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, 'unauthenticated', 'Sign in required');
  return user;
}

export async function assertOwnsSite(siteId: number, userId: number): Promise<Site> {
  const [row] = await getDb()
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)));
  if (!row) throw new ApiError(404, 'not_found', 'Site not found');
  return row;
}

export async function assertOwnsGeneration(
  generationId: number,
  userId: number,
): Promise<Generation> {
  const [row] = await getDb()
    .select()
    .from(generations)
    .where(and(eq(generations.id, generationId), eq(generations.userId, userId)));
  if (!row) throw new ApiError(404, 'not_found', 'Generation not found');
  return row;
}

export function apiErrorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return new Response(
      JSON.stringify({ error: { code: err.code, message: err.message } }),
      { status: err.status, headers: { 'content-type': 'application/json' } },
    );
  }
  console.error('[api] unhandled error', err);
  return new Response(
    JSON.stringify({ error: { code: 'internal', message: 'Internal Server Error' } }),
    { status: 500, headers: { 'content-type': 'application/json' } },
  );
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
pnpm test src/lib/auth-guards.test.ts
```
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth-guards.ts src/lib/auth-guards.test.ts
git commit -m "feat(auth-guards): owner checks and ApiError"
```

---

### Task 10: `llmstxt` CLI wrapper — execa + streaming Blob upload

**Files:**
- Create: `src/lib/llmstxt.ts`
- Create: `src/lib/llmstxt.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/llmstxt.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Readable } from 'node:stream';
import { runLlmstxt } from './llmstxt';

vi.mock('execa', () => {
  return {
    execa: vi.fn(),
  };
});

vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (pathname: string, body: any) => ({
    url: `https://blob.test/${pathname}`,
    pathname,
  })),
}));

import { execa } from 'execa';
import { put } from '@vercel/blob';

function fakeProc(stdout: string, exitCode = 0, stderr = '') {
  const stream = Readable.from([Buffer.from(stdout)]);
  const promise: any = Promise.resolve({ stdout, stderr, exitCode });
  promise.stdout = stream;
  promise.stderr = Readable.from([Buffer.from(stderr)]);
  return promise;
}

describe('runLlmstxt', () => {
  beforeEach(() => {
    vi.mocked(execa).mockReset();
    vi.mocked(put).mockClear();
  });

  it('runs gen and uploads stdout to the given blob path', async () => {
    vi.mocked(execa).mockReturnValue(fakeProc('# llms.txt\n- a\n- b\n'));
    const out = await runLlmstxt({
      subcommand: 'gen',
      sitemapUrl: 'https://x.test/sitemap.xml',
      blobPath: 'gens/1/llms.txt',
      maxBytes: 1024,
    });
    expect(out.blobPath).toBe('gens/1/llms.txt');
    expect(vi.mocked(put)).toHaveBeenCalledTimes(1);
  });

  it('throws on non-zero exit code with truncated stderr', async () => {
    vi.mocked(execa).mockReturnValue(fakeProc('', 1, 'bad sitemap'));
    await expect(
      runLlmstxt({
        subcommand: 'gen',
        sitemapUrl: 'https://x.test/sitemap.xml',
        blobPath: 'gens/2/llms.txt',
        maxBytes: 1024,
      }),
    ).rejects.toThrow(/bad sitemap|exit code 1/);
  });

  it('throws when stdout exceeds maxBytes', async () => {
    vi.mocked(execa).mockReturnValue(fakeProc('x'.repeat(2000)));
    await expect(
      runLlmstxt({
        subcommand: 'gen-full',
        sitemapUrl: 'https://x.test/sitemap.xml',
        blobPath: 'gens/3/llms-full.txt',
        maxBytes: 100,
      }),
    ).rejects.toThrow(/size limit/i);
  });
});
```

- [ ] **Step 2: Run test, expect fail**

```bash
pnpm test src/lib/llmstxt.test.ts
```
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/llmstxt.ts`:

```ts
import { execa } from 'execa';
import { put } from '@vercel/blob';
import { Readable, PassThrough } from 'node:stream';
import path from 'node:path';

export type RunOpts = {
  subcommand: 'gen' | 'gen-full';
  sitemapUrl: string;
  blobPath: string;
  maxBytes: number;
};

export type RunResult = {
  blobPath: string;
  url: string;
  bytes: number;
};

const BIN = path.resolve(process.cwd(), 'node_modules/.bin/llmstxt');

export async function runLlmstxt(opts: RunOpts): Promise<RunResult> {
  const proc = execa(BIN, [opts.subcommand, opts.sitemapUrl], {
    buffer: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderrChunks = '';
  proc.stderr?.on('data', (c) => {
    stderrChunks += c.toString();
    if (stderrChunks.length > 4096) stderrChunks = stderrChunks.slice(-4096);
  });

  const guarded = guardSize(proc.stdout!, opts.maxBytes);
  const upload = put(opts.blobPath, Readable.toWeb(guarded.stream) as any, {
    access: 'public',
    contentType: 'text/plain; charset=utf-8',
    addRandomSuffix: false,
  } as any);

  let result: { url: string; pathname: string };
  try {
    [result] = await Promise.all([upload, proc]);
  } catch (err: any) {
    if (guarded.error) throw guarded.error;
    const exit = err?.exitCode ?? 'unknown';
    const tail = (stderrChunks || err?.message || '').slice(-500);
    throw new Error(`llmstxt ${opts.subcommand} failed (exit code ${exit}): ${tail}`);
  }

  return { blobPath: opts.blobPath, url: result.url, bytes: guarded.bytes };
}

function guardSize(input: NodeJS.ReadableStream, maxBytes: number) {
  const out = new PassThrough();
  const ref: { stream: NodeJS.ReadableStream; bytes: number; error: Error | null } = {
    stream: out,
    bytes: 0,
    error: null,
  };
  input.on('data', (chunk: Buffer) => {
    ref.bytes += chunk.length;
    if (ref.bytes > maxBytes) {
      ref.error = new Error(`Output exceeded size limit (${maxBytes} bytes).`);
      out.destroy(ref.error);
      (input as any).destroy?.();
      return;
    }
    out.write(chunk);
  });
  input.on('end', () => out.end());
  input.on('error', (e) => out.destroy(e));
  return ref;
}
```

- [ ] **Step 4: Run test, expect pass**

```bash
pnpm test src/lib/llmstxt.test.ts
```
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/llmstxt.ts src/lib/llmstxt.test.ts
git commit -m "feat(llmstxt): execa wrapper streaming stdout to Vercel Blob"
```

---

## Phase 3 — Workflow (WDK)

> **WDK API note**: The exact `@vercel/workflow` surface should be verified at https://vercel.com/docs/workflow before writing code. The shape used below — `defineWorkflow(name, fn)`, `step.run(name, fn)`, `step.parallel([...])`, `startWorkflow(name, payload)`, `cancelWorkflow(runId)` — is the working assumption. If the package exposes different names, adapt the import surface in **only `src/lib/workflow/wdk.ts`** (Task 11) and the rest of the workflow code stays as written.

### Task 11: WDK adapter (`src/lib/workflow/wdk.ts`) + hello-workflow smoke

**Files:**
- Create: `src/lib/workflow/wdk.ts`
- Create: `src/lib/workflow/hello.ts`
- Create: `src/lib/workflow/hello.test.ts`

- [ ] **Step 1: Write failing test**

The pattern: each workflow exports two things — a plain async **runner** function (callable from tests with mocks) and a registered **workflow** (production-only, invoked via `start()` from `workflow/api`). Tests target the runner.

Create `src/lib/workflow/hello.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('workflow', () => {
  const stepRun = async (_name: string, fn: () => Promise<any>) => fn();
  const stepParallel = async (fns: Array<() => Promise<any>>) =>
    Promise.all(fns.map((f) => f()));
  return {
    workflow: (_name: string, fn: any) => fn,
    step: { run: stepRun, parallel: stepParallel },
  };
});
vi.mock('workflow/api', () => ({
  start: vi.fn(async () => ({ runId: 'r1' })),
  cancel: vi.fn(async () => true),
}));

import { runHello } from './hello';

describe('runHello', () => {
  it('runs end to end and returns the greeting', async () => {
    const out = await runHello({ name: 'world' });
    expect(out).toBe('hello, world');
  });
});
```

- [ ] **Step 2: Run test, expect fail**

```bash
pnpm test src/lib/workflow/hello.test.ts
```
Expected: FAIL — module does not exist.

- [ ] **Step 3: Set up OIDC for WDK (one-time, local)**

WDK requires AI Gateway OIDC. Run:

```bash
vercel link
vercel env pull .env.local
```

Confirm `VERCEL_OIDC_TOKEN` is now present in `.env.local`. Without it, the workflow runner cannot authenticate.

- [ ] **Step 4: Implement WDK adapter**

Create `src/lib/workflow/wdk.ts`:

```ts
// Single import surface for WDK so the rest of the codebase doesn't depend
// on the package's exact API shape. Adjust here if your installed package
// uses different module paths (e.g., `@vercel/workflow`).
import { workflow as defineWorkflow, step } from 'workflow';
import { start, cancel } from 'workflow/api';

export { defineWorkflow, step, start, cancel };

export type StepFn<T> = () => Promise<T>;

export async function runStep<T>(name: string, fn: StepFn<T>): Promise<T> {
  console.log(`[workflow.step] ${name} → start`);
  try {
    const out = await step.run(name, fn);
    console.log(`[workflow.step] ${name} → ok`);
    return out;
  } catch (err) {
    console.error(`[workflow.step] ${name} → fail`, err);
    throw err;
  }
}

export async function parallelSteps<T extends readonly unknown[]>(
  fns: { [K in keyof T]: StepFn<T[K]> },
): Promise<T> {
  return step.parallel([...fns]) as Promise<T>;
}
```

- [ ] **Step 5: Implement hello-workflow**

Create `src/lib/workflow/hello.ts`:

```ts
import { defineWorkflow, runStep } from './wdk';

export type HelloPayload = { name: string };

/** Plain async runner — testable in isolation. */
export async function runHello({ name }: HelloPayload): Promise<string> {
  return runStep('greet', async () => `hello, ${name}`);
}

/** Registered workflow — invoked in production via start('hello', payload). */
export const helloWorkflow = defineWorkflow('hello', runHello);
```

- [ ] **Step 6: Run test, expect pass**

```bash
pnpm test src/lib/workflow/hello.test.ts
```
Expected: 1 passed.

- [ ] **Step 7: Commit**

```bash
git add src/lib/workflow/
git commit -m "feat(workflow): WDK adapter and hello smoke workflow"
```

---

### Task 12: Workflow steps for the generation pipeline

**Files:**
- Create: `src/lib/workflow/steps.ts`
- Create: `src/lib/workflow/steps.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/workflow/steps.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, generations, users } from '@/db/schema';
import { eq } from 'drizzle-orm';

vi.mock('execa', () => ({ execa: vi.fn() }));
vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (pathname: string) => ({
    url: `https://blob.test/${pathname}`,
    pathname,
  })),
}));
vi.mock('@/lib/sitemap-discover', () => ({
  discoverSitemap: vi.fn(async () => 'https://x.test/sitemap.xml'),
}));
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn(async () => ({ data: { id: 'em1' }, error: null })) },
  })),
}));

import { execa } from 'execa';
import { Readable } from 'node:stream';
import { prepareStep, runGenStep, runFullStep, completeStep, notifyStep } from './steps';

function fakeProc(stdout: string, exitCode = 0) {
  const promise: any = Promise.resolve({ stdout, stderr: '', exitCode });
  promise.stdout = Readable.from([Buffer.from(stdout)]);
  promise.stderr = Readable.from([]);
  return promise;
}

describe('workflow steps', () => {
  let userId: number;
  let siteId: number;
  let generationId: number;

  beforeEach(async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    userId = u.id;
    const [s] = await db
      .insert(sites)
      .values({
        userId,
        name: 'S',
        rootUrl: 'https://x.test',
        webhookTokenHash: 'a'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();
    siteId = s.id;
    const [g] = await db
      .insert(generations)
      .values({ siteId, userId, trigger: 'manual', notifyEmail: false })
      .returning();
    generationId = g.id;

    vi.mocked(execa).mockReturnValue(fakeProc('# fixture\n'));
  });

  it('prepareStep flips status to running and resolves sitemap', async () => {
    const out = await prepareStep(generationId);
    expect(out.sitemapUrl).toBe('https://x.test/sitemap.xml');
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.status).toBe('running');
    expect(g.startedAt).not.toBeNull();
    expect(g.resolvedSitemapUrl).toBe('https://x.test/sitemap.xml');
  });

  it('prepareStep is idempotent on resume', async () => {
    await prepareStep(generationId);
    const out = await prepareStep(generationId);
    expect(out.sitemapUrl).toBe('https://x.test/sitemap.xml');
  });

  it('runGenStep writes llmsBlobPath', async () => {
    await runGenStep(generationId, 'https://x.test/sitemap.xml');
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.llmsBlobPath).toBe(`gens/${generationId}/llms.txt`);
  });

  it('runFullStep writes llmsFullBlobPath', async () => {
    await runFullStep(generationId, 'https://x.test/sitemap.xml');
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.llmsFullBlobPath).toBe(`gens/${generationId}/llms-full.txt`);
  });

  it('completeStep marks succeeded and updates site.lastGeneratedAt', async () => {
    await completeStep(generationId);
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    const [s] = await getDb().select().from(sites).where(eq(sites.id, siteId));
    expect(g.status).toBe('succeeded');
    expect(g.completedAt).not.toBeNull();
    expect(s.lastGeneratedAt).not.toBeNull();
  });

  it('notifyStep is a no-op when notifyEmail=false', async () => {
    await notifyStep(generationId);
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.notifiedAt).toBeNull();
  });

  it('notifyStep sends email and sets notifiedAt when notifyEmail=true', async () => {
    await getDb()
      .update(generations)
      .set({ notifyEmail: true, status: 'succeeded' })
      .where(eq(generations.id, generationId));
    await notifyStep(generationId);
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.notifiedAt).not.toBeNull();
  });

  it('notifyStep is idempotent when notifiedAt is already set', async () => {
    await getDb()
      .update(generations)
      .set({ notifyEmail: true, notifiedAt: '2026-05-07T00:00:00Z' })
      .where(eq(generations.id, generationId));
    await notifyStep(generationId); // must not throw
    const [g] = await getDb().select().from(generations).where(eq(generations.id, generationId));
    expect(g.notifiedAt).toBe('2026-05-07T00:00:00Z');
  });
});
```

- [ ] **Step 2: Run tests, expect fail**

```bash
pnpm test src/lib/workflow/steps.test.ts
```
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/workflow/steps.ts`:

```ts
import { eq } from 'drizzle-orm';
import { Resend } from 'resend';
import { getDb } from '@/db';
import { generations, sites, users } from '@/db/schema';
import { discoverSitemap } from '@/lib/sitemap-discover';
import { runLlmstxt } from '@/lib/llmstxt';

const MAX_OUTPUT_BYTES = Number(process.env.MAX_OUTPUT_BYTES ?? 50 * 1024 * 1024);

function nowIso() {
  return new Date().toISOString();
}

export async function prepareStep(generationId: number): Promise<{ sitemapUrl: string }> {
  const db = getDb();
  const [g] = await db.select().from(generations).where(eq(generations.id, generationId));
  if (!g) throw new Error(`generation ${generationId} not found`);
  const [s] = await db.select().from(sites).where(eq(sites.id, g.siteId));
  if (!s) throw new Error(`site ${g.siteId} not found`);

  const sitemapUrl = s.sitemapUrl ?? (await discoverSitemap(s.rootUrl));

  await db
    .update(generations)
    .set({
      status: 'running',
      startedAt: g.startedAt ?? nowIso(),
      resolvedSitemapUrl: sitemapUrl,
      updatedAt: nowIso(),
    })
    .where(eq(generations.id, generationId));

  return { sitemapUrl };
}

export async function runGenStep(generationId: number, sitemapUrl: string) {
  const blobPath = `gens/${generationId}/llms.txt`;
  await runLlmstxt({ subcommand: 'gen', sitemapUrl, blobPath, maxBytes: MAX_OUTPUT_BYTES });
  await getDb()
    .update(generations)
    .set({ llmsBlobPath: blobPath, updatedAt: nowIso() })
    .where(eq(generations.id, generationId));
}

export async function runFullStep(generationId: number, sitemapUrl: string) {
  const blobPath = `gens/${generationId}/llms-full.txt`;
  await runLlmstxt({ subcommand: 'gen-full', sitemapUrl, blobPath, maxBytes: MAX_OUTPUT_BYTES });
  await getDb()
    .update(generations)
    .set({ llmsFullBlobPath: blobPath, updatedAt: nowIso() })
    .where(eq(generations.id, generationId));
}

export async function completeStep(generationId: number) {
  const db = getDb();
  const [g] = await db.select().from(generations).where(eq(generations.id, generationId));
  if (!g) return;
  const ts = nowIso();
  await db
    .update(generations)
    .set({ status: 'succeeded', completedAt: ts, updatedAt: ts })
    .where(eq(generations.id, generationId));
  await db
    .update(sites)
    .set({ lastGeneratedAt: ts, updatedAt: ts })
    .where(eq(sites.id, g.siteId));
}

export async function notifyStep(generationId: number) {
  const db = getDb();
  const [g] = await db.select().from(generations).where(eq(generations.id, generationId));
  if (!g) return;
  if (!g.notifyEmail) return;
  if (g.notifiedAt) return;

  const [u] = await db.select().from(users).where(eq(users.id, g.userId));
  if (!u) return;

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'Auth <noreply@example.com>';

  if (!apiKey) {
    console.log('[notifyStep] RESEND_API_KEY missing, would have emailed', u.email);
  } else {
    const resend = new Resend(apiKey);
    const baseUrl = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000';
    const link = `${baseUrl}/g/${g.id}`;
    try {
      await resend.emails.send({
        from: fromEmail,
        to: u.email,
        subject: 'Your llms.txt is ready',
        html: `<p>Your generation completed.</p><p><a href="${link}">View and download</a></p>`,
      });
    } catch (err) {
      console.error('[notifyStep] resend failed', err);
      return; // do not set notifiedAt on failure
    }
  }

  await db
    .update(generations)
    .set({ notifiedAt: nowIso(), updatedAt: nowIso() })
    .where(eq(generations.id, generationId));
}

export async function failStep(generationId: number, stepName: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const truncated = `${stepName}: ${message}`.slice(0, 500);
  await getDb()
    .update(generations)
    .set({
      status: 'failed',
      errorMessage: truncated,
      completedAt: nowIso(),
      updatedAt: nowIso(),
    })
    .where(eq(generations.id, generationId));
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm test src/lib/workflow/steps.test.ts
```
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workflow/steps.ts src/lib/workflow/steps.test.ts
git commit -m "feat(workflow): generation pipeline steps with idempotent updates"
```

---

### Task 13: Compose `generateSiteFiles` workflow

**Files:**
- Create: `src/lib/workflow/generate-site-files.ts`
- Create: `src/lib/workflow/generate-site-files.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/workflow/generate-site-files.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Readable } from 'node:stream';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { eq } from 'drizzle-orm';
import { sites, generations, users } from '@/db/schema';

vi.mock('workflow', () => {
  const stepRun = async (_name: string, fn: () => Promise<any>) => fn();
  const stepParallel = async (fns: Array<() => Promise<any>>) =>
    Promise.all(fns.map((f) => f()));
  return {
    workflow: (_name: string, fn: any) => fn,
    step: { run: stepRun, parallel: stepParallel },
  };
});
vi.mock('workflow/api', () => ({
  start: vi.fn(async () => ({ runId: 'r1' })),
  cancel: vi.fn(async () => true),
}));

vi.mock('execa', () => ({
  execa: vi.fn(() => {
    const promise: any = Promise.resolve({ stdout: '# x\n', stderr: '', exitCode: 0 });
    promise.stdout = Readable.from([Buffer.from('# x\n')]);
    promise.stderr = Readable.from([]);
    return promise;
  }),
}));
vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (pathname: string) => ({
    url: `https://blob.test/${pathname}`,
    pathname,
  })),
}));
vi.mock('@/lib/sitemap-discover', () => ({
  discoverSitemap: vi.fn(async () => 'https://x.test/sitemap.xml'),
}));

import { runGenerateSiteFiles } from './generate-site-files';

describe('runGenerateSiteFiles', () => {
  let generationId: number;

  beforeEach(async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const [s] = await db
      .insert(sites)
      .values({
        userId: u.id,
        name: 'S',
        rootUrl: 'https://x.test',
        webhookTokenHash: 'a'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();
    const [g] = await db
      .insert(generations)
      .values({ siteId: s.id, userId: u.id, trigger: 'manual' })
      .returning();
    generationId = g.id;
  });

  it('runs prepare → runGen|runFull → complete and ends in succeeded', async () => {
    await runGenerateSiteFiles({ generationId });
    const [g] = await getDb()
      .select()
      .from(generations)
      .where(eq(generations.id, generationId));
    expect(g.status).toBe('succeeded');
    expect(g.llmsBlobPath).toBe(`gens/${generationId}/llms.txt`);
    expect(g.llmsFullBlobPath).toBe(`gens/${generationId}/llms-full.txt`);
  });

  it('marks generation failed when a step throws', async () => {
    const mod = await import('@/lib/sitemap-discover');
    vi.mocked(mod.discoverSitemap).mockRejectedValueOnce(new Error('No sitemap found'));

    await runGenerateSiteFiles({ generationId });
    const [g] = await getDb()
      .select()
      .from(generations)
      .where(eq(generations.id, generationId));
    expect(g.status).toBe('failed');
    expect(g.errorMessage).toMatch(/No sitemap found/);
  });
});
```

- [ ] **Step 2: Run tests, expect fail**

```bash
pnpm test src/lib/workflow/generate-site-files.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/lib/workflow/generate-site-files.ts`:

```ts
import { defineWorkflow, runStep, parallelSteps } from './wdk';
import {
  prepareStep,
  runGenStep,
  runFullStep,
  completeStep,
  notifyStep,
  failStep,
} from './steps';

export type GenerateSiteFilesPayload = { generationId: number };

/** Plain runner — call from tests with mocks. Production uses start() instead. */
export async function runGenerateSiteFiles({ generationId }: GenerateSiteFilesPayload) {
  console.log(`[workflow] generateSiteFiles start id=${generationId}`);
  try {
    const { sitemapUrl } = await runStep('prepare', () => prepareStep(generationId));

    await parallelSteps([
      () => runStep('runGen', () => runGenStep(generationId, sitemapUrl)),
      () => runStep('runFull', () => runFullStep(generationId, sitemapUrl)),
    ]);

    await runStep('complete', () => completeStep(generationId));
    await runStep('notify', () => notifyStep(generationId));
    console.log(`[workflow] generateSiteFiles ok id=${generationId}`);
    return { ok: true };
  } catch (err) {
    const stepName = inferStepName(err);
    console.error(`[workflow] generateSiteFiles fail id=${generationId} step=${stepName}`, err);
    await failStep(generationId, stepName, err);
    return { ok: false };
  }
}

/** Registered workflow — invoke in production via start('generateSiteFiles', payload). */
export const generateSiteFilesWorkflow = defineWorkflow(
  'generateSiteFiles',
  runGenerateSiteFiles,
);

function inferStepName(err: unknown): string {
  if (err instanceof Error && err.message) {
    if (/sitemap/i.test(err.message)) return 'prepare';
    if (/llms-full|gen-full/i.test(err.message)) return 'runFull';
    if (/llms\.txt|gen /i.test(err.message)) return 'runGen';
  }
  return 'workflow';
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm test src/lib/workflow/generate-site-files.test.ts
```
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/workflow/generate-site-files.ts src/lib/workflow/generate-site-files.test.ts
git commit -m "feat(workflow): generateSiteFiles parallel pipeline with failure capture"
```

---

## Phase 4 — Convergence helper

### Task 14: `enqueueGenerationsForSite`

**Files:**
- Create: `src/lib/enqueue-generations.ts`
- Create: `src/lib/enqueue-generations.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/lib/enqueue-generations.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, generations, users } from '@/db/schema';
import { eq } from 'drizzle-orm';

vi.mock('workflow', () => ({
  workflow: (_name: string, fn: any) => fn,
  step: {
    run: async (_n: string, f: any) => f(),
    parallel: async (fns: any[]) => Promise.all(fns.map((f) => f())),
  },
}));
vi.mock('workflow/api', () => ({
  start: vi.fn(async () => ({ runId: 'wf-run-1' })),
  cancel: vi.fn(async () => true),
}));

import { enqueueGenerationsForSite } from './enqueue-generations';

describe('enqueueGenerationsForSite', () => {
  let userId: number;
  let siteId: number;

  beforeEach(async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    userId = u.id;
    const [s] = await db
      .insert(sites)
      .values({
        userId,
        name: 'S',
        rootUrl: 'https://x.test',
        webhookTokenHash: 'a'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();
    siteId = s.id;
  });

  it('inserts a pending generation and stores the workflowRunId', async () => {
    const g = await enqueueGenerationsForSite(siteId, { trigger: 'manual' });
    expect(g.status).toBe('pending');
    expect(g.workflowRunId).toBe('wf-run-1');
    expect(g.notifyEmail).toBe(false);
  });

  it('webhook trigger forces notifyEmail=true', async () => {
    const g = await enqueueGenerationsForSite(siteId, { trigger: 'webhook' });
    expect(g.notifyEmail).toBe(true);
    expect(g.trigger).toBe('webhook');
  });

  it('returns existing in-flight generation on dedupe', async () => {
    const first = await enqueueGenerationsForSite(siteId, { trigger: 'manual' });
    const second = await enqueueGenerationsForSite(siteId, { trigger: 'manual' });
    expect(second.id).toBe(first.id);
  });

  it('does not dedupe against terminal generations', async () => {
    const first = await enqueueGenerationsForSite(siteId, { trigger: 'manual' });
    await getDb()
      .update(generations)
      .set({ status: 'succeeded' })
      .where(eq(generations.id, first.id));

    const second = await enqueueGenerationsForSite(siteId, { trigger: 'manual' });
    expect(second.id).not.toBe(first.id);
  });
});
```

- [ ] **Step 2: Run tests, expect fail**

```bash
pnpm test src/lib/enqueue-generations.test.ts
```
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/lib/enqueue-generations.ts`:

```ts
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { generations, sites, type Generation } from '@/db/schema';
import { start } from '@/lib/workflow/wdk';

export type EnqueueOpts = {
  trigger: 'manual' | 'webhook';
  notifyEmail?: boolean;
};

export async function enqueueGenerationsForSite(
  siteId: number,
  opts: EnqueueOpts,
): Promise<Generation> {
  const db = getDb();

  const [site] = await db.select().from(sites).where(eq(sites.id, siteId));
  if (!site) throw new Error(`site ${siteId} not found`);

  const inFlight = await db
    .select()
    .from(generations)
    .where(
      and(eq(generations.siteId, siteId), inArray(generations.status, ['pending', 'running'])),
    );
  if (inFlight.length > 0) return inFlight[0];

  const notifyEmail = opts.trigger === 'webhook' ? true : opts.notifyEmail ?? false;

  const [row] = await db
    .insert(generations)
    .values({
      siteId,
      userId: site.userId,
      status: 'pending',
      trigger: opts.trigger,
      notifyEmail,
    })
    .returning();

  const { runId } = await start('generateSiteFiles', { generationId: row.id });

  const [updated] = await db
    .update(generations)
    .set({ workflowRunId: runId, updatedAt: new Date().toISOString() })
    .where(eq(generations.id, row.id))
    .returning();

  return updated;
}
```

- [ ] **Step 4: Run tests, expect pass**

```bash
pnpm test src/lib/enqueue-generations.test.ts
```
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/enqueue-generations.ts src/lib/enqueue-generations.test.ts
git commit -m "feat(enqueue): single helper for manual + webhook generation triggers"
```

---

## Phase 5 — API routes

> **Shared route shape**: every API route follows the same skeleton — wrap the handler in a try/catch that returns `apiErrorResponse(err)` on throw. JSON in, JSON out. Auth via `requireUserOrThrow()` (sites/generations) or webhook bearer token (webhook route).

### Task 15: `POST` and `GET` `/api/sites`

**Files:**
- Create: `src/app/api/sites/route.ts`
- Create: `src/app/api/sites/route.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/app/api/sites/route.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users } from '@/db/schema';

vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
}));

import { GET, POST } from './route';
import { getCurrentUser } from '@/lib/auth';

function jsonRequest(body: any): Request {
  return new Request('http://t/api/sites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/sites', () => {
  let userId: number;
  beforeEach(async () => {
    await setupTestDb();
    const [u] = await getDb()
      .insert(users)
      .values({ name: 'A', email: 'a@a.test' })
      .returning();
    userId = u.id;
    vi.mocked(getCurrentUser).mockResolvedValue(u);
  });

  it('creates a site and returns the one-time token', async () => {
    const res = await POST(jsonRequest({ name: 'Acme', rootUrl: 'https://acme.com' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.site.name).toBe('Acme');
    expect(body.site.rootUrl).toBe('https://acme.com');
    expect(body.webhookToken).toMatch(/^lmt_/);
  });

  it('rejects invalid URL', async () => {
    const res = await POST(jsonRequest({ name: 'X', rootUrl: 'not-a-url' }));
    expect(res.status).toBe(400);
  });

  it('returns 409 on duplicate (userId, rootUrl)', async () => {
    await POST(jsonRequest({ name: 'Acme', rootUrl: 'https://acme.com' }));
    const res = await POST(jsonRequest({ name: 'Acme2', rootUrl: 'https://acme.com' }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('site_exists');
  });

  it('401 when unauthenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await POST(jsonRequest({ name: 'A', rootUrl: 'https://a.test' }));
    expect(res.status).toBe(401);
  });
});

describe('GET /api/sites', () => {
  it('returns only the caller\'s sites', async () => {
    await setupTestDb();
    const db = getDb();
    const [u1] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const [u2] = await db.insert(users).values({ name: 'B', email: 'b@b.test' }).returning();
    vi.mocked(getCurrentUser).mockResolvedValue(u1);

    await POST(jsonRequest({ name: 'Mine', rootUrl: 'https://mine.test' }));
    vi.mocked(getCurrentUser).mockResolvedValue(u2);
    await POST(jsonRequest({ name: 'Theirs', rootUrl: 'https://theirs.test' }));

    vi.mocked(getCurrentUser).mockResolvedValue(u1);
    const res = await GET();
    const body = await res.json();
    expect(body.sites).toHaveLength(1);
    expect(body.sites[0].name).toBe('Mine');
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm test src/app/api/sites/route.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/app/api/sites/route.ts
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sites } from '@/db/schema';
import { ApiError, apiErrorResponse, requireUserOrThrow } from '@/lib/auth-guards';
import { createSiteSchema } from '@/lib/validators';
import { createWebhookToken } from '@/lib/webhook-token';

export async function POST(req: Request) {
  try {
    const user = await requireUserOrThrow();
    const body = createSiteSchema.parse(await req.json());

    const existing = await getDb()
      .select()
      .from(sites)
      .where(eq(sites.userId, user.id));
    if (existing.some((s) => s.rootUrl === body.rootUrl)) {
      throw new ApiError(409, 'site_exists', 'You already have a site for this URL');
    }

    const tok = createWebhookToken();
    const [row] = await getDb()
      .insert(sites)
      .values({
        userId: user.id,
        name: body.name,
        rootUrl: body.rootUrl,
        sitemapUrl: body.sitemapUrl ?? null,
        webhookTokenHash: tok.hash,
        webhookTokenPrefix: tok.prefix,
      })
      .returning();

    return Response.json({ site: row, webhookToken: tok.token }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.name === 'ZodError') {
      return apiErrorResponse(new ApiError(400, 'validation', err.message));
    }
    return apiErrorResponse(err);
  }
}

export async function GET() {
  try {
    const user = await requireUserOrThrow();
    const rows = await getDb().select().from(sites).where(eq(sites.userId, user.id));
    return Response.json({ sites: rows });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test src/app/api/sites/route.test.ts
```
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/sites/
git commit -m "feat(api): POST/GET /api/sites with one-time webhook token"
```

---

### Task 16: `GET` `PATCH` `DELETE` `/api/sites/[id]`

**Files:**
- Create: `src/app/api/sites/[id]/route.ts`
- Create: `src/app/api/sites/[id]/route.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/app/api/sites/[id]/route.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users } from '@/db/schema';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));

import { GET, PATCH, DELETE } from './route';
import { getCurrentUser } from '@/lib/auth';

async function makeUserAndSite(email: string) {
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'X', email }).returning();
  const [s] = await db
    .insert(sites)
    .values({
      userId: u.id,
      name: 'S',
      rootUrl: `https://${email.split('@')[0]}.test`,
      webhookTokenHash: 'a'.repeat(64),
      webhookTokenPrefix: 'lmt_aaaa',
    })
    .returning();
  return { user: u, site: s };
}

const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });

describe('site id route', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  it('GET returns the site to its owner', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const res = await GET(new Request('http://t'), ctx(site.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.site.id).toBe(site.id);
  });

  it('GET returns 404 for non-owner', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    const { user: other } = await makeUserAndSite('b@b.test');
    vi.mocked(getCurrentUser).mockResolvedValue(other);

    const res = await GET(new Request('http://t'), ctx(site.id));
    expect(res.status).toBe(404);
  });

  it('PATCH updates name', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const res = await PATCH(
      new Request('http://t', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'New' }),
      }),
      ctx(site.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.site.name).toBe('New');
  });

  it('DELETE returns 204 and removes the row', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const res = await DELETE(new Request('http://t'), ctx(site.id));
    expect(res.status).toBe(204);
    const after = await getDb().select().from(sites);
    expect(after.find((s) => s.id === site.id)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm test src/app/api/sites/[id]/route.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/app/api/sites/[id]/route.ts
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sites } from '@/db/schema';
import {
  apiErrorResponse,
  ApiError,
  assertOwnsSite,
  requireUserOrThrow,
} from '@/lib/auth-guards';
import { updateSiteSchema } from '@/lib/validators';

type Ctx = { params: Promise<{ id: string }> };

async function parseSiteId(ctx: Ctx): Promise<number> {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(404, 'not_found', 'Site not found');
  return n;
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const id = await parseSiteId(ctx);
    const site = await assertOwnsSite(id, user.id);
    return Response.json({ site });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const id = await parseSiteId(ctx);
    await assertOwnsSite(id, user.id);
    const body = updateSiteSchema.parse(await req.json());

    const [updated] = await getDb()
      .update(sites)
      .set({ ...body, updatedAt: new Date().toISOString() })
      .where(eq(sites.id, id))
      .returning();

    return Response.json({ site: updated });
  } catch (err) {
    if (err instanceof Error && err.name === 'ZodError') {
      return apiErrorResponse(new ApiError(400, 'validation', err.message));
    }
    return apiErrorResponse(err);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const id = await parseSiteId(ctx);
    await assertOwnsSite(id, user.id);
    await getDb().delete(sites).where(eq(sites.id, id));
    return new Response(null, { status: 204 });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test src/app/api/sites/[id]/route.test.ts
```
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/api/sites/[id]/'
git commit -m "feat(api): GET/PATCH/DELETE /api/sites/[id] with owner checks"
```

---

### Task 17: `POST /api/sites/[id]/rotate-token`

**Files:**
- Create: `src/app/api/sites/[id]/rotate-token/route.ts`
- Create: `src/app/api/sites/[id]/rotate-token/route.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/app/api/sites/[id]/rotate-token/route.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users } from '@/db/schema';
import { eq } from 'drizzle-orm';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
import { POST } from './route';
import { getCurrentUser } from '@/lib/auth';

const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

describe('POST rotate-token', () => {
  it('issues a new token and replaces the hash', async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const [s] = await db
      .insert(sites)
      .values({
        userId: u.id,
        name: 'S',
        rootUrl: 'https://s.test',
        webhookTokenHash: 'a'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();
    vi.mocked(getCurrentUser).mockResolvedValue(u);

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(s.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.webhookToken).toMatch(/^lmt_/);

    const [after] = await db.select().from(sites).where(eq(sites.id, s.id));
    expect(after.webhookTokenHash).not.toBe('a'.repeat(64));
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm test 'src/app/api/sites/[id]/rotate-token/route.test.ts'
```
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/app/api/sites/[id]/rotate-token/route.ts
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sites } from '@/db/schema';
import {
  apiErrorResponse,
  ApiError,
  assertOwnsSite,
  requireUserOrThrow,
} from '@/lib/auth-guards';
import { createWebhookToken } from '@/lib/webhook-token';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id } = await ctx.params;
    const siteId = Number(id);
    if (!Number.isInteger(siteId) || siteId <= 0) {
      throw new ApiError(404, 'not_found', 'Site not found');
    }
    await assertOwnsSite(siteId, user.id);

    const tok = createWebhookToken();
    await getDb()
      .update(sites)
      .set({
        webhookTokenHash: tok.hash,
        webhookTokenPrefix: tok.prefix,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(sites.id, siteId));

    return Response.json({ webhookToken: tok.token });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test 'src/app/api/sites/[id]/rotate-token/route.test.ts'
```
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/api/sites/[id]/rotate-token/'
git commit -m "feat(api): rotate site webhook token"
```

---

### Task 18: `POST` and `GET` `/api/generations`

**Files:**
- Create: `src/app/api/generations/route.ts`
- Create: `src/app/api/generations/route.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// src/app/api/generations/route.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users } from '@/db/schema';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('workflow', () => ({
  workflow: (_n: string, fn: any) => fn,
  step: { run: async (_n: string, f: any) => f(), parallel: async (fns: any[]) => Promise.all(fns.map((f) => f())) },
}));
vi.mock('workflow/api', () => ({
  start: vi.fn(async () => ({ runId: 'wf-1' })),
  cancel: vi.fn(async () => true),
}));

import { GET, POST } from './route';
import { getCurrentUser } from '@/lib/auth';

function jsonReq(body: any, query = '') {
  return new Request('http://t/api/generations' + query, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/generations', () => {
  let userId: number;
  let siteId: number;
  beforeEach(async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    userId = u.id;
    const [s] = await db
      .insert(sites)
      .values({
        userId,
        name: 'S',
        rootUrl: 'https://s.test',
        webhookTokenHash: 'a'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();
    siteId = s.id;
    vi.mocked(getCurrentUser).mockResolvedValue(u);
  });

  it('creates a generation for an existing site', async () => {
    const res = await POST(jsonReq({ siteId }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.generation.siteId).toBe(siteId);
    expect(body.generation.trigger).toBe('manual');
    expect(body.generation.notifyEmail).toBe(false);
  });

  it('honors notifyEmail flag', async () => {
    const res = await POST(jsonReq({ siteId, notifyEmail: true }));
    const body = await res.json();
    expect(body.generation.notifyEmail).toBe(true);
  });

  it('creates a site inline when payload has rootUrl', async () => {
    const res = await POST(jsonReq({ name: 'New', rootUrl: 'https://new.test' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.generation.siteId).not.toBe(siteId);
  });

  it('rejects mixing siteId and inline shape', async () => {
    const res = await POST(jsonReq({ siteId, name: 'X', rootUrl: 'https://x.test' }));
    expect(res.status).toBe(400);
  });

  it('404 when siteId is not owned', async () => {
    const db = getDb();
    const [other] = await db.insert(users).values({ name: 'O', email: 'o@o.test' }).returning();
    vi.mocked(getCurrentUser).mockResolvedValue(other);
    const res = await POST(jsonReq({ siteId }));
    expect(res.status).toBe(404);
  });
});

describe('GET /api/generations', () => {
  it('returns the caller\'s generations, optionally filtered by siteId', async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    vi.mocked(getCurrentUser).mockResolvedValue(u);

    await POST(jsonReq({ name: 'A', rootUrl: 'https://a.test' }));
    await POST(jsonReq({ name: 'B', rootUrl: 'https://b.test' }));

    const res = await GET(new Request('http://t/api/generations'));
    const body = await res.json();
    expect(body.generations.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm test src/app/api/generations/route.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/app/api/generations/route.ts
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { generations, sites } from '@/db/schema';
import {
  apiErrorResponse,
  ApiError,
  assertOwnsSite,
  requireUserOrThrow,
} from '@/lib/auth-guards';
import { createGenerationSchema } from '@/lib/validators';
import { createWebhookToken } from '@/lib/webhook-token';
import { enqueueGenerationsForSite } from '@/lib/enqueue-generations';

export async function POST(req: Request) {
  try {
    const user = await requireUserOrThrow();
    const body = createGenerationSchema.parse(await req.json());

    let siteId: number;
    if ('siteId' in body) {
      await assertOwnsSite(body.siteId, user.id);
      siteId = body.siteId;
    } else {
      // Inline create site
      const tok = createWebhookToken();
      const existing = await getDb()
        .select()
        .from(sites)
        .where(and(eq(sites.userId, user.id), eq(sites.rootUrl, body.rootUrl)));
      if (existing.length > 0) {
        siteId = existing[0].id;
      } else {
        const [row] = await getDb()
          .insert(sites)
          .values({
            userId: user.id,
            name: body.name,
            rootUrl: body.rootUrl,
            sitemapUrl: body.sitemapUrl ?? null,
            webhookTokenHash: tok.hash,
            webhookTokenPrefix: tok.prefix,
          })
          .returning();
        siteId = row.id;
      }
    }

    const generation = await enqueueGenerationsForSite(siteId, {
      trigger: 'manual',
      notifyEmail: body.notifyEmail ?? false,
    });
    return Response.json({ generation }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.name === 'ZodError') {
      return apiErrorResponse(new ApiError(400, 'validation', err.message));
    }
    return apiErrorResponse(err);
  }
}

export async function GET(req: Request) {
  try {
    const user = await requireUserOrThrow();
    const url = new URL(req.url);
    const siteIdParam = url.searchParams.get('siteId');

    const where = siteIdParam
      ? and(eq(generations.userId, user.id), eq(generations.siteId, Number(siteIdParam)))
      : eq(generations.userId, user.id);

    const rows = await getDb()
      .select()
      .from(generations)
      .where(where)
      .orderBy(desc(generations.createdAt));

    return Response.json({ generations: rows });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test src/app/api/generations/route.test.ts
```
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/generations/route.ts src/app/api/generations/route.test.ts
git commit -m "feat(api): POST/GET /api/generations with inline-site fallback"
```

---

### Task 19: `GET /api/generations/[id]`

**Files:**
- Create: `src/app/api/generations/[id]/route.ts`
- Create: `src/app/api/generations/[id]/route.test.ts`

- [ ] **Step 1: Test**

```ts
// src/app/api/generations/[id]/route.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { generations, sites, users } from '@/db/schema';
import { eq } from 'drizzle-orm';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
import { GET } from './route';
import { getCurrentUser } from '@/lib/auth';

const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

describe('GET /api/generations/[id]', () => {
  it('returns the generation with download URLs once paths exist', async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const [s] = await db
      .insert(sites)
      .values({
        userId: u.id,
        name: 'S',
        rootUrl: 'https://s.test',
        webhookTokenHash: 'a'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();
    const [g] = await db
      .insert(generations)
      .values({
        siteId: s.id,
        userId: u.id,
        trigger: 'manual',
        llmsBlobPath: 'gens/1/llms.txt',
      })
      .returning();
    vi.mocked(getCurrentUser).mockResolvedValue(u);

    const res = await GET(new Request('http://t'), ctx(g.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.generation.id).toBe(g.id);
    expect(body.downloads.llms).toBe(`/api/generations/${g.id}/files/llms`);
    expect(body.downloads.llmsFull).toBeUndefined();
  });

  it('404 for non-owner', async () => {
    await setupTestDb();
    const db = getDb();
    const [u1] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const [u2] = await db.insert(users).values({ name: 'B', email: 'b@b.test' }).returning();
    const [s] = await db
      .insert(sites)
      .values({
        userId: u1.id,
        name: 'S',
        rootUrl: 'https://s.test',
        webhookTokenHash: 'a'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();
    const [g] = await db
      .insert(generations)
      .values({ siteId: s.id, userId: u1.id, trigger: 'manual' })
      .returning();
    vi.mocked(getCurrentUser).mockResolvedValue(u2);

    const res = await GET(new Request('http://t'), ctx(g.id));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm test 'src/app/api/generations/[id]/route.test.ts'
```

- [ ] **Step 3: Implement**

```ts
// src/app/api/generations/[id]/route.ts
import {
  apiErrorResponse,
  ApiError,
  assertOwnsGeneration,
  requireUserOrThrow,
} from '@/lib/auth-guards';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id } = await ctx.params;
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ApiError(404, 'not_found', 'Generation not found');
    }
    const generation = await assertOwnsGeneration(n, user.id);

    const downloads: { llms?: string; llmsFull?: string } = {};
    if (generation.llmsBlobPath) downloads.llms = `/api/generations/${generation.id}/files/llms`;
    if (generation.llmsFullBlobPath) {
      downloads.llmsFull = `/api/generations/${generation.id}/files/llms-full`;
    }

    return Response.json({ generation, downloads });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test 'src/app/api/generations/[id]/route.test.ts'
```
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/api/generations/[id]/route.ts' 'src/app/api/generations/[id]/route.test.ts'
git commit -m "feat(api): GET /api/generations/[id] with download links"
```

---

### Task 20: `GET /api/generations/[id]/stream` — SSE

**Files:**
- Create: `src/app/api/generations/[id]/stream/route.ts`
- Create: `src/app/api/generations/[id]/stream/route.test.ts`

> SSE pattern: stream a `text/event-stream` response, poll the DB row every 1s for changes, emit on change, send a 15s heartbeat, close on terminal status or 10-min idle. The runtime is Node.js (Fluid Compute) — `Response.body` is a `ReadableStream<Uint8Array>`.

- [ ] **Step 1: Test (driven by polling abstraction)**

```ts
// src/app/api/generations/[id]/stream/route.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { generations, sites, users } from '@/db/schema';
import { eq } from 'drizzle-orm';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
import { buildEventStream } from './route';
import { getCurrentUser } from '@/lib/auth';

describe('SSE stream builder', () => {
  it('emits a status event when row changes and closes on terminal', async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const [s] = await db
      .insert(sites)
      .values({
        userId: u.id,
        name: 'S',
        rootUrl: 'https://s.test',
        webhookTokenHash: 'a'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();
    const [g] = await db
      .insert(generations)
      .values({ siteId: s.id, userId: u.id, trigger: 'manual', status: 'pending' })
      .returning();
    vi.mocked(getCurrentUser).mockResolvedValue(u);

    const events: string[] = [];
    const fakeWriter = { write: (s: string) => events.push(s), close: vi.fn() };

    const loop = buildEventStream(g.id, u.id, fakeWriter as any, { intervalMs: 5, heartbeatMs: 1000, idleTimeoutMs: 1000 });

    await new Promise((r) => setTimeout(r, 20));
    await db.update(generations).set({ status: 'running' }).where(eq(generations.id, g.id));
    await new Promise((r) => setTimeout(r, 20));
    await db.update(generations).set({ status: 'succeeded' }).where(eq(generations.id, g.id));

    await loop;

    const body = events.join('');
    expect(body).toMatch(/status/);
    expect(body).toMatch(/succeeded/);
    expect(fakeWriter.close).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm test 'src/app/api/generations/[id]/stream/route.test.ts'
```

- [ ] **Step 3: Implement**

```ts
// src/app/api/generations/[id]/stream/route.ts
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { generations } from '@/db/schema';
import {
  apiErrorResponse,
  ApiError,
  assertOwnsGeneration,
  requireUserOrThrow,
} from '@/lib/auth-guards';

type Ctx = { params: Promise<{ id: string }> };

type Writer = { write: (s: string) => void; close: () => void };

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);

export async function buildEventStream(
  generationId: number,
  userId: number,
  writer: Writer,
  opts: { intervalMs: number; heartbeatMs: number; idleTimeoutMs: number },
): Promise<void> {
  let lastSerialized = '';
  let lastEventAt = Date.now();

  const tick = async (): Promise<boolean> => {
    const [row] = await getDb()
      .select()
      .from(generations)
      .where(eq(generations.id, generationId));
    if (!row || row.userId !== userId) return true;

    const snapshot = JSON.stringify({
      status: row.status,
      llmsBlobPath: row.llmsBlobPath,
      llmsFullBlobPath: row.llmsFullBlobPath,
      errorMessage: row.errorMessage,
    });
    if (snapshot !== lastSerialized) {
      writer.write(`event: status\ndata: ${snapshot}\n\n`);
      lastSerialized = snapshot;
      lastEventAt = Date.now();
    }

    if (TERMINAL.has(row.status)) return true;
    return false;
  };

  let lastHeartbeat = Date.now();
  while (true) {
    const done = await tick();
    if (done) break;
    if (Date.now() - lastEventAt > opts.idleTimeoutMs) break;
    if (Date.now() - lastHeartbeat > opts.heartbeatMs) {
      writer.write(`: heartbeat\n\n`);
      lastHeartbeat = Date.now();
    }
    await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
  writer.close();
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id } = await ctx.params;
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ApiError(404, 'not_found', 'Generation not found');
    }
    await assertOwnsGeneration(n, user.id);

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder();
        const writer: Writer = {
          write: (s) => controller.enqueue(enc.encode(s)),
          close: () => controller.close(),
        };
        buildEventStream(n, user.id, writer, {
          intervalMs: 1000,
          heartbeatMs: 15_000,
          idleTimeoutMs: 10 * 60_000,
        });
      },
    });

    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test 'src/app/api/generations/[id]/stream/route.test.ts'
```
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/api/generations/[id]/stream/'
git commit -m "feat(api): SSE stream of generation status changes"
```

---

### Task 21: `GET /api/generations/[id]/files/[kind]` — proxy download

**Files:**
- Create: `src/app/api/generations/[id]/files/[kind]/route.ts`
- Create: `src/app/api/generations/[id]/files/[kind]/route.test.ts`

- [ ] **Step 1: Test**

```ts
// route.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { generations, sites, users } from '@/db/schema';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@vercel/blob', () => ({
  head: vi.fn(async (url: string) => ({ url, pathname: url.split('/').pop()!, size: 5 })),
}));
const fetchSpy = vi.fn();
vi.stubGlobal('fetch', fetchSpy);

import { GET } from './route';
import { getCurrentUser } from '@/lib/auth';

const ctx = (id: number, kind: string) => ({
  params: Promise.resolve({ id: String(id), kind }),
});

describe('GET file proxy', () => {
  beforeEach(() => {
    fetchSpy.mockReset();
    fetchSpy.mockResolvedValue(new Response('hello', { status: 200, headers: { 'content-type': 'text/plain' } }));
  });

  it('streams the blob for owner', async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const [s] = await db
      .insert(sites)
      .values({
        userId: u.id,
        name: 'S',
        rootUrl: 'https://s.test',
        webhookTokenHash: 'a'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();
    const [g] = await db
      .insert(generations)
      .values({
        siteId: s.id,
        userId: u.id,
        trigger: 'manual',
        llmsBlobPath: 'gens/1/llms.txt',
      })
      .returning();
    vi.mocked(getCurrentUser).mockResolvedValue(u);

    const res = await GET(new Request('http://t'), ctx(g.id, 'llms'));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hello');
  });

  it('404 when path is missing', async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const [s] = await db
      .insert(sites)
      .values({
        userId: u.id,
        name: 'S',
        rootUrl: 'https://s.test',
        webhookTokenHash: 'a'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();
    const [g] = await db
      .insert(generations)
      .values({ siteId: s.id, userId: u.id, trigger: 'manual' })
      .returning();
    vi.mocked(getCurrentUser).mockResolvedValue(u);

    const res = await GET(new Request('http://t'), ctx(g.id, 'llms'));
    expect(res.status).toBe(404);
  });

  it('400 on invalid kind', async () => {
    const res = await GET(new Request('http://t'), ctx(1, 'bogus'));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm test 'src/app/api/generations/[id]/files/[kind]/route.test.ts'
```

- [ ] **Step 3: Implement**

```ts
// src/app/api/generations/[id]/files/[kind]/route.ts
import { head } from '@vercel/blob';
import {
  apiErrorResponse,
  ApiError,
  assertOwnsGeneration,
  requireUserOrThrow,
} from '@/lib/auth-guards';

type Ctx = { params: Promise<{ id: string; kind: string }> };

const KINDS = { llms: 'llmsBlobPath', 'llms-full': 'llmsFullBlobPath' } as const;
type Kind = keyof typeof KINDS;

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { id, kind } = await ctx.params;
    if (!(kind in KINDS)) {
      throw new ApiError(400, 'validation', `Invalid kind: ${kind}`);
    }
    const user = await requireUserOrThrow();
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ApiError(404, 'not_found', 'Generation not found');
    }
    const gen = await assertOwnsGeneration(n, user.id);
    const pathField = KINDS[kind as Kind];
    const blobPath = (gen as any)[pathField] as string | null;
    if (!blobPath) throw new ApiError(404, 'not_found', 'File not ready');

    const meta = await head(`https://blob.vercel-storage.com/${blobPath}`);
    const downstream = await fetch(meta.url);
    if (!downstream.ok) {
      throw new ApiError(502, 'storage_error', 'Failed to fetch blob');
    }

    const filename = kind === 'llms' ? 'llms.txt' : 'llms-full.txt';
    return new Response(downstream.body, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test 'src/app/api/generations/[id]/files/[kind]/route.test.ts'
```
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/api/generations/[id]/files/'
git commit -m "feat(api): authed proxy download for generated files"
```

---

### Task 22: `POST /api/generations/[id]/cancel`

**Files:**
- Create: `src/app/api/generations/[id]/cancel/route.ts`
- Create: `src/app/api/generations/[id]/cancel/route.test.ts`

- [ ] **Step 1: Test**

```ts
// route.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { generations, sites, users } from '@/db/schema';
import { eq } from 'drizzle-orm';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('workflow', () => ({
  workflow: (_n: string, fn: any) => fn,
  step: { run: async (_n: string, f: any) => f(), parallel: async (fns: any[]) => Promise.all(fns.map((f) => f())) },
}));
vi.mock('workflow/api', () => ({
  start: vi.fn(),
  cancel: vi.fn(async () => true),
}));

import { POST } from './route';
import { getCurrentUser } from '@/lib/auth';

const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

describe('POST /api/generations/[id]/cancel', () => {
  it('cancels a running generation', async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const [s] = await db
      .insert(sites)
      .values({
        userId: u.id,
        name: 'S',
        rootUrl: 'https://s.test',
        webhookTokenHash: 'a'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();
    const [g] = await db
      .insert(generations)
      .values({
        siteId: s.id,
        userId: u.id,
        trigger: 'manual',
        status: 'running',
        workflowRunId: 'wf-1',
      })
      .returning();
    vi.mocked(getCurrentUser).mockResolvedValue(u);

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(g.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.generation.status).toBe('cancelled');
  });

  it('idempotent on terminal generation', async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const [s] = await db
      .insert(sites)
      .values({
        userId: u.id,
        name: 'S',
        rootUrl: 'https://s.test',
        webhookTokenHash: 'a'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();
    const [g] = await db
      .insert(generations)
      .values({ siteId: s.id, userId: u.id, trigger: 'manual', status: 'succeeded' })
      .returning();
    vi.mocked(getCurrentUser).mockResolvedValue(u);

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(g.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.generation.status).toBe('succeeded');
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm test 'src/app/api/generations/[id]/cancel/route.test.ts'
```

- [ ] **Step 3: Implement**

```ts
// src/app/api/generations/[id]/cancel/route.ts
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { generations } from '@/db/schema';
import {
  apiErrorResponse,
  ApiError,
  assertOwnsGeneration,
  requireUserOrThrow,
} from '@/lib/auth-guards';
import { cancel } from '@/lib/workflow/wdk';

type Ctx = { params: Promise<{ id: string }> };

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id } = await ctx.params;
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) {
      throw new ApiError(404, 'not_found', 'Generation not found');
    }
    const gen = await assertOwnsGeneration(n, user.id);

    if (TERMINAL.has(gen.status)) {
      return Response.json({ generation: gen });
    }

    if (gen.workflowRunId) {
      try {
        await cancel(gen.workflowRunId);
      } catch (err) {
        console.warn('[cancel] WDK cancel failed', err);
      }
    }

    const ts = new Date().toISOString();
    const [updated] = await getDb()
      .update(generations)
      .set({ status: 'cancelled', completedAt: ts, updatedAt: ts })
      .where(eq(generations.id, n))
      .returning();

    return Response.json({ generation: updated });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test 'src/app/api/generations/[id]/cancel/route.test.ts'
```
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/api/generations/[id]/cancel/'
git commit -m "feat(api): cancel a running generation"
```

---

### Task 23: `POST /api/webhooks/sites/[siteId]/regenerate`

**Files:**
- Create: `src/app/api/webhooks/sites/[siteId]/regenerate/route.ts`
- Create: `src/app/api/webhooks/sites/[siteId]/regenerate/route.test.ts`

- [ ] **Step 1: Test**

```ts
// route.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users } from '@/db/schema';
import { createWebhookToken, hashToken } from '@/lib/webhook-token';

vi.mock('workflow', () => ({
  workflow: (_n: string, fn: any) => fn,
  step: { run: async (_n: string, f: any) => f(), parallel: async (fns: any[]) => Promise.all(fns.map((f) => f())) },
}));
vi.mock('workflow/api', () => ({
  start: vi.fn(async () => ({ runId: 'wf-1' })),
  cancel: vi.fn(),
}));

import { POST } from './route';

const ctx = (siteId: number) => ({ params: Promise.resolve({ siteId: String(siteId) }) });

async function setup() {
  await setupTestDb();
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
  const tok = createWebhookToken();
  const [s] = await db
    .insert(sites)
    .values({
      userId: u.id,
      name: 'S',
      rootUrl: 'https://s.test',
      webhookTokenHash: tok.hash,
      webhookTokenPrefix: tok.prefix,
    })
    .returning();
  return { user: u, site: s, token: tok.token };
}

function tokenReq(token: string) {
  return new Request('http://t', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
  });
}

describe('webhook regenerate', () => {
  it('202 with generation, notifyEmail forced true', async () => {
    const { site, token } = await setup();
    const res = await POST(tokenReq(token), ctx(site.id));
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.generation.notifyEmail).toBe(true);
    expect(body.generation.trigger).toBe('webhook');
  });

  it('401 on missing token', async () => {
    const { site } = await setup();
    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(site.id));
    expect(res.status).toBe(401);
  });

  it('401 on bad token', async () => {
    const { site } = await setup();
    const res = await POST(tokenReq('lmt_wrong'), ctx(site.id));
    expect(res.status).toBe(401);
  });

  it('404 on unknown siteId', async () => {
    const { token } = await setup();
    const res = await POST(tokenReq(token), ctx(999_999));
    expect(res.status).toBe(404);
  });

  it('dedupe sets X-Dedup: hit', async () => {
    const { site, token } = await setup();
    await POST(tokenReq(token), ctx(site.id));
    const second = await POST(tokenReq(token), ctx(site.id));
    expect(second.status).toBe(202);
    expect(second.headers.get('x-dedup')).toBe('hit');
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm test 'src/app/api/webhooks/sites/[siteId]/regenerate/route.test.ts'
```

- [ ] **Step 3: Implement**

```ts
// src/app/api/webhooks/sites/[siteId]/regenerate/route.ts
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { sites, generations } from '@/db/schema';
import { ApiError, apiErrorResponse } from '@/lib/auth-guards';
import { verifyToken } from '@/lib/webhook-token';
import { enqueueGenerationsForSite } from '@/lib/enqueue-generations';

type Ctx = { params: Promise<{ siteId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const auth = req.headers.get('authorization') ?? '';
    const match = auth.match(/^Bearer\s+(\S+)/i);
    if (!match) throw new ApiError(401, 'unauthenticated', 'Missing bearer token');
    const presented = match[1];

    const { siteId: idStr } = await ctx.params;
    const siteId = Number(idStr);
    if (!Number.isInteger(siteId) || siteId <= 0) {
      throw new ApiError(404, 'not_found', 'Site not found');
    }

    const [site] = await getDb().select().from(sites).where(eq(sites.id, siteId));
    if (!site) throw new ApiError(404, 'not_found', 'Site not found');

    if (!verifyToken(presented, site.webhookTokenHash)) {
      throw new ApiError(401, 'unauthenticated', 'Invalid token');
    }

    // Detect dedupe before insert so we can set the X-Dedup header.
    const inFlight = await getDb()
      .select()
      .from(generations)
      .where(
        and(eq(generations.siteId, siteId), inArray(generations.status, ['pending', 'running'])),
      );

    const generation = await enqueueGenerationsForSite(siteId, { trigger: 'webhook' });

    const headers: Record<string, string> = {};
    if (inFlight.length > 0) headers['x-dedup'] = 'hit';

    return Response.json({ generation }, { status: 202, headers });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test 'src/app/api/webhooks/sites/[siteId]/regenerate/route.test.ts'
```
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add 'src/app/api/webhooks/'
git commit -m "feat(api): webhook regenerate with bearer token + dedupe header"
```

---

## Phase 6 — UI components

> **Conventions**: every component file has a sibling `.test.tsx`. Use ShadCN primitives and DESIGN.md tokens (`bg-canvas`, `text-ink`, etc.) as documented in `CLAUDE.md`. Do not introduce timeline-pastel classes for status badges (DESIGN.md "Don't" #4).

### Task 24: `StatusBadge`

**Files:**
- Create: `src/components/generations/status-badge.tsx`
- Create: `src/components/generations/status-badge.test.tsx`

- [ ] **Step 1: Test**

```tsx
// status-badge.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  it.each([
    ['pending', 'PENDING', 'bg-surface-strong'],
    ['running', 'RUNNING', 'bg-canvas-soft'],
    ['succeeded', 'DONE', 'bg-semantic-success'],
    ['failed', 'FAILED', 'bg-destructive'],
    ['cancelled', 'Cancelled', 'text-muted-soft'],
  ] as const)('renders %s with text %s and class containing %s', (status, label, cls) => {
    const { container } = render(<StatusBadge status={status} />);
    expect(screen.getByText(new RegExp(label, 'i'))).toBeInTheDocument();
    expect(container.firstChild).toHaveClass(cls);
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm test src/components/generations/status-badge.test.tsx
```

- [ ] **Step 3: Implement**

```tsx
// status-badge.tsx
import { cn } from '@/lib/utils';

type Status = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';

const MAP: Record<Status, { label: string; cls: string; pill: boolean }> = {
  pending: { label: 'PENDING', cls: 'bg-surface-strong text-muted-strong', pill: true },
  running: { label: 'RUNNING', cls: 'bg-canvas-soft text-ink', pill: true },
  succeeded: { label: 'DONE', cls: 'bg-semantic-success text-canvas', pill: true },
  failed: { label: 'FAILED', cls: 'bg-destructive text-canvas', pill: true },
  cancelled: { label: 'Cancelled', cls: 'text-muted-soft italic', pill: false },
};

export function StatusBadge({ status }: { status: Status }) {
  const { label, cls, pill } = MAP[status];
  if (!pill) {
    return <span className={cn('caption-uppercase', cls)}>{label}</span>;
  }
  return (
    <span
      className={cn(
        'caption-uppercase inline-flex items-center rounded-pill px-2.5 py-1',
        cls,
      )}
    >
      {status === 'running' && (
        <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-ink" />
      )}
      {label}
    </span>
  );
}
```

- [ ] **Step 4: Run, expect pass**

```bash
pnpm test src/components/generations/status-badge.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/components/generations/status-badge.*
git commit -m "feat(ui): StatusBadge with semantic-token mapping"
```

---

### Task 25: `SiteForm`

**Files:**
- Create: `src/components/sites/site-form.tsx`
- Create: `src/components/sites/site-form.test.tsx`

- [ ] **Step 1: Test**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { SiteForm } from './site-form';

describe('SiteForm', () => {
  it('calls onSubmit with valid input', async () => {
    const onSubmit = vi.fn();
    render(<SiteForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/name/i), 'Acme');
    await userEvent.type(screen.getByLabelText(/website url/i), 'https://acme.com');
    await userEvent.click(screen.getByRole('button', { name: /create site/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Acme',
      rootUrl: 'https://acme.com',
      sitemapUrl: undefined,
    });
  });

  it('shows error when URL is invalid', async () => {
    const onSubmit = vi.fn();
    render(<SiteForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText(/name/i), 'A');
    await userEvent.type(screen.getByLabelText(/website url/i), 'bogus');
    await userEvent.click(screen.getByRole('button', { name: /create site/i }));
    expect(await screen.findByText(/valid url|http/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement**

```tsx
// site-form.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSiteSchema } from '@/lib/validators';

export type SiteFormValues = {
  name: string;
  rootUrl: string;
  sitemapUrl?: string;
};

export function SiteForm({ onSubmit }: { onSubmit: (v: SiteFormValues) => void }) {
  const [name, setName] = useState('');
  const [rootUrl, setRootUrl] = useState('');
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createSiteSchema.safeParse({
      name,
      rootUrl,
      sitemapUrl: sitemapUrl || undefined,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }
    setError(null);
    onSubmit({
      name: parsed.data.name,
      rootUrl: parsed.data.rootUrl,
      sitemapUrl: parsed.data.sitemapUrl,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="rootUrl">Website URL</Label>
        <Input
          id="rootUrl"
          value={rootUrl}
          onChange={(e) => setRootUrl(e.target.value)}
          placeholder="https://example.com"
        />
      </div>
      <div>
        <Label htmlFor="sitemapUrl">Sitemap URL (optional)</Label>
        <Input
          id="sitemapUrl"
          value={sitemapUrl}
          onChange={(e) => setSitemapUrl(e.target.value)}
          placeholder="https://example.com/sitemap.xml"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit">Create site</Button>
    </form>
  );
}
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add src/components/sites/site-form.*
git commit -m "feat(ui): SiteForm with Zod validation"
```

---

### Task 26: `WebhookBlock`

**Files:**
- Create: `src/components/sites/webhook-block.tsx`
- Create: `src/components/sites/webhook-block.test.tsx`

- [ ] **Step 1: Test**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { WebhookBlock } from './webhook-block';

describe('WebhookBlock', () => {
  it('shows masked token by default', () => {
    render(<WebhookBlock siteId={1} tokenPrefix="lmt_aaaa" onRotate={vi.fn()} />);
    expect(screen.getByText(/lmt_aaaa/)).toBeInTheDocument();
    expect(screen.getByText(/•+/)).toBeInTheDocument();
  });

  it('shows fresh token when freshToken prop is set', () => {
    render(
      <WebhookBlock siteId={1} tokenPrefix="lmt_aaaa" freshToken="lmt_aaaaSECRET" onRotate={vi.fn()} />,
    );
    expect(screen.getByDisplayValue('lmt_aaaaSECRET')).toBeInTheDocument();
  });

  it('calls onRotate when rotate clicked', async () => {
    const onRotate = vi.fn();
    render(<WebhookBlock siteId={1} tokenPrefix="lmt_aaaa" onRotate={onRotate} />);
    await userEvent.click(screen.getByRole('button', { name: /rotate/i }));
    expect(onRotate).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement**

```tsx
// webhook-block.tsx
'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function WebhookBlock({
  siteId,
  tokenPrefix,
  freshToken,
  onRotate,
}: {
  siteId: number;
  tokenPrefix: string;
  freshToken?: string;
  onRotate: () => void;
}) {
  const url = `/api/webhooks/sites/${siteId}/regenerate`;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface-card p-4">
      <div className="text-sm">
        <div className="caption-uppercase text-muted-strong">Webhook URL</div>
        <code className="font-mono text-ink">{url}</code>
      </div>
      <div className="text-sm">
        <div className="caption-uppercase text-muted-strong">Bearer token</div>
        {freshToken ? (
          <Input readOnly value={freshToken} aria-label="fresh webhook token" />
        ) : (
          <span className="font-mono text-ink">{tokenPrefix}••••••••••••••••••••••••</span>
        )}
      </div>
      <Button onClick={onRotate} variant="outline" className="self-start">
        Rotate token
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add src/components/sites/webhook-block.*
git commit -m "feat(ui): WebhookBlock with masked-by-default token"
```

---

### Task 27: `SitesList`

**Files:**
- Create: `src/components/sites/sites-list.tsx`
- Create: `src/components/sites/sites-list.test.tsx`

- [ ] **Step 1: Test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SitesList } from './sites-list';
import type { Site } from '@/db/schema';

const mkSite = (over: Partial<Site> = {}): Site => ({
  id: 1,
  userId: 1,
  name: 'Acme',
  rootUrl: 'https://acme.com',
  sitemapUrl: null,
  webhookTokenHash: 'h',
  webhookTokenPrefix: 'lmt_xxxx',
  lastGeneratedAt: null,
  createdAt: '2026-05-07T00:00:00Z',
  updatedAt: '2026-05-07T00:00:00Z',
  ...over,
});

describe('SitesList', () => {
  it('renders empty state', () => {
    render(<SitesList sites={[]} />);
    expect(screen.getByText(/add your first site/i)).toBeInTheDocument();
  });

  it('renders each site with its name and URL', () => {
    render(<SitesList sites={[mkSite()]} />);
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('https://acme.com')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement**

```tsx
// sites-list.tsx
import Link from 'next/link';
import type { Site } from '@/db/schema';

export function SitesList({ sites }: { sites: Site[] }) {
  if (sites.length === 0) {
    return (
      <div className="rounded-lg border border-hairline bg-surface-card p-8 text-center">
        <p className="display-sm text-ink">Add your first site</p>
        <p className="mt-2 text-body">Create a site to start generating llms.txt files.</p>
        <Link
          href="/sites/new"
          className="mt-4 inline-flex h-10 items-center rounded-md bg-ink px-4 text-canvas"
        >
          New site
        </Link>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {sites.map((s) => (
        <li
          key={s.id}
          className="flex items-center justify-between rounded-lg border border-hairline bg-surface-card p-4"
        >
          <div>
            <div className="title-md text-ink">{s.name}</div>
            <div className="text-sm text-body">{s.rootUrl}</div>
          </div>
          <Link
            href={`/sites/${s.id}`}
            className="caption-uppercase text-muted-strong hover:text-ink"
          >
            Open →
          </Link>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add src/components/sites/sites-list.*
git commit -m "feat(ui): SitesList with empty state"
```

---

### Task 28: `GenerationsTable`

**Files:**
- Create: `src/components/generations/generations-table.tsx`
- Create: `src/components/generations/generations-table.test.tsx`

- [ ] **Step 1: Test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { GenerationsTable } from './generations-table';
import type { Generation } from '@/db/schema';

const mk = (over: Partial<Generation> = {}): Generation => ({
  id: 1,
  siteId: 1,
  userId: 1,
  status: 'succeeded',
  trigger: 'manual',
  notifyEmail: false,
  notifiedAt: null,
  workflowRunId: null,
  resolvedSitemapUrl: null,
  llmsBlobPath: null,
  llmsFullBlobPath: null,
  errorMessage: null,
  startedAt: null,
  completedAt: null,
  createdAt: '2026-05-07T00:00:00Z',
  updatedAt: '2026-05-07T00:00:00Z',
  ...over,
});

describe('GenerationsTable', () => {
  it('renders empty state', () => {
    render(<GenerationsTable generations={[]} />);
    expect(screen.getByText(/no generations yet/i)).toBeInTheDocument();
  });

  it('lists generations newest-first', () => {
    render(
      <GenerationsTable
        generations={[
          mk({ id: 1, createdAt: '2026-05-01T00:00:00Z' }),
          mk({ id: 2, createdAt: '2026-05-07T00:00:00Z' }),
        ]}
      />,
    );
    const items = screen.getAllByRole('row');
    expect(items[1]).toHaveTextContent('#2');
    expect(items[2]).toHaveTextContent('#1');
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement**

```tsx
// generations-table.tsx
import Link from 'next/link';
import type { Generation } from '@/db/schema';
import { StatusBadge } from './status-badge';

export function GenerationsTable({ generations }: { generations: Generation[] }) {
  if (generations.length === 0) {
    return <p className="text-sm text-body">No generations yet.</p>;
  }
  const sorted = [...generations].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left caption-uppercase text-muted-strong">
          <th className="py-2">ID</th>
          <th className="py-2">Status</th>
          <th className="py-2">Trigger</th>
          <th className="py-2">Created</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {sorted.map((g) => (
          <tr key={g.id} className="border-t border-hairline">
            <td className="py-2 font-mono">#{g.id}</td>
            <td className="py-2">
              <StatusBadge status={g.status} />
            </td>
            <td className="py-2">{g.trigger}</td>
            <td className="py-2 font-mono text-body">{g.createdAt}</td>
            <td className="py-2 text-right">
              <Link href={`/g/${g.id}`} className="text-ink hover:underline">
                View →
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add src/components/generations/generations-table.*
git commit -m "feat(ui): GenerationsTable sorted desc"
```

---

### Task 29: `GenerationDetailCard`

**Files:**
- Create: `src/components/generations/generation-detail-card.tsx`
- Create: `src/components/generations/generation-detail-card.test.tsx`

- [ ] **Step 1: Test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GenerationDetailCard } from './generation-detail-card';
import type { Generation } from '@/db/schema';

const mk = (over: Partial<Generation> = {}): Generation => ({
  id: 1,
  siteId: 1,
  userId: 1,
  status: 'pending',
  trigger: 'manual',
  notifyEmail: false,
  notifiedAt: null,
  workflowRunId: null,
  resolvedSitemapUrl: null,
  llmsBlobPath: null,
  llmsFullBlobPath: null,
  errorMessage: null,
  startedAt: null,
  completedAt: null,
  createdAt: 't',
  updatedAt: 't',
  ...over,
});

describe('GenerationDetailCard', () => {
  it('disables download buttons until paths exist', () => {
    render(<GenerationDetailCard generation={mk({ status: 'running' })} onRetry={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: /download llms\.txt/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /download llms-full\.txt/i })).toBeDisabled();
  });

  it('enables downloads when paths populate', () => {
    render(
      <GenerationDetailCard
        generation={mk({ status: 'succeeded', llmsBlobPath: 'p1', llmsFullBlobPath: 'p2' })}
        onRetry={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('link', { name: /download llms\.txt/i })).toBeInTheDocument();
  });

  it('shows error block on failed', () => {
    render(
      <GenerationDetailCard
        generation={mk({ status: 'failed', errorMessage: 'boom' })}
        onRetry={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/boom/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement**

```tsx
// generation-detail-card.tsx
'use client';

import Link from 'next/link';
import type { Generation } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { StatusBadge } from './status-badge';

export function GenerationDetailCard({
  generation,
  onRetry,
  onCancel,
}: {
  generation: Generation;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const isTerminal = ['succeeded', 'failed', 'cancelled'].includes(generation.status);
  const llmsHref = generation.llmsBlobPath
    ? `/api/generations/${generation.id}/files/llms`
    : null;
  const llmsFullHref = generation.llmsFullBlobPath
    ? `/api/generations/${generation.id}/files/llms-full`
    : null;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-hairline bg-surface-card p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="display-sm text-ink">Generation #{generation.id}</div>
          <div className="mt-1 text-sm text-body">
            Trigger: {generation.trigger}
          </div>
        </div>
        <StatusBadge status={generation.status} />
      </div>

      {generation.errorMessage && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {generation.errorMessage}
        </div>
      )}

      <div className="flex gap-2">
        {llmsHref ? (
          <Link
            href={llmsHref}
            className="inline-flex h-10 items-center rounded-md bg-ink px-4 text-sm text-canvas"
          >
            Download llms.txt
          </Link>
        ) : (
          <Button disabled>Download llms.txt</Button>
        )}
        {llmsFullHref ? (
          <Link
            href={llmsFullHref}
            className="inline-flex h-10 items-center rounded-md border border-hairline-strong bg-surface-card px-4 text-sm text-ink"
          >
            Download llms-full.txt
          </Link>
        ) : (
          <Button disabled variant="outline">
            Download llms-full.txt
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        {!isTerminal && (
          <Button onClick={onCancel} variant="outline">
            Cancel
          </Button>
        )}
        {(generation.status === 'failed' || generation.status === 'cancelled') && (
          <Button onClick={onRetry}>Retry</Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add src/components/generations/generation-detail-card.*
git commit -m "feat(ui): GenerationDetailCard with downloads + retry/cancel"
```

---

### Task 30: `RegenerateButton`

**Files:**
- Create: `src/components/generations/regenerate-button.tsx`
- Create: `src/components/generations/regenerate-button.test.tsx`

- [ ] **Step 1: Test**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { RegenerateButton } from './regenerate-button';

describe('RegenerateButton', () => {
  it('opens popover and submits with email toggle off by default', async () => {
    const onSubmit = vi.fn();
    render(<RegenerateButton siteId={1} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: /regenerate/i }));
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onSubmit).toHaveBeenCalledWith({ siteId: 1, notifyEmail: false });
  });

  it('passes notifyEmail when toggle checked', async () => {
    const onSubmit = vi.fn();
    render(<RegenerateButton siteId={1} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole('button', { name: /regenerate/i }));
    await userEvent.click(screen.getByLabelText(/email me when done/i));
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onSubmit).toHaveBeenCalledWith({ siteId: 1, notifyEmail: true });
  });
});
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement**

```tsx
// regenerate-button.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function RegenerateButton({
  siteId,
  onSubmit,
}: {
  siteId: number;
  onSubmit: (v: { siteId: number; notifyEmail: boolean }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState(false);

  return (
    <div className="relative inline-block">
      <Button onClick={() => setOpen((v) => !v)}>Regenerate</Button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-72 rounded-lg border border-hairline bg-surface-card p-4 shadow-none">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={notifyEmail}
              onChange={(e) => setNotifyEmail(e.target.checked)}
            />
            Email me when done
          </label>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                onSubmit({ siteId, notifyEmail });
                setOpen(false);
              }}
            >
              Confirm
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add src/components/generations/regenerate-button.*
git commit -m "feat(ui): RegenerateButton with email-on-done toggle"
```

---

## Phase 7 — Pages

### Task 31: `(app)` route group + auth-gated layout

**Files:**
- Create: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/app/(app)/layout.tsx
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
```

- [ ] **Step 2: Smoke check**

```bash
pnpm dev
```
Visit `http://localhost:3000/dashboard` while signed out → redirects to `/signin`. Sign in → renders header.

- [ ] **Step 3: Commit**

```bash
git add 'src/app/(app)/layout.tsx'
git commit -m "feat(app): auth-gated layout with header"
```

---

### Task 32: `/dashboard` page

**Files:**
- Create: `src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/app/(app)/dashboard/page.tsx
import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sites } from '@/db/schema';
import { requireUser } from '@/lib/auth-guards';
import { SitesList } from '@/components/sites/sites-list';

export default async function DashboardPage() {
  const user = await requireUser();
  const userSites = await getDb()
    .select()
    .from(sites)
    .where(eq(sites.userId, user.id));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="display-lg text-ink">Sites</h1>
        <Link
          href="/sites/new"
          className="inline-flex h-10 items-center rounded-md bg-ink px-4 text-sm text-canvas"
        >
          + New site
        </Link>
      </div>
      <SitesList sites={userSites} />
    </div>
  );
}
```

- [ ] **Step 2: Smoke check**

```bash
pnpm dev
```
Sign in, visit `/dashboard`. With no sites: shows empty state. With sites: lists them.

- [ ] **Step 3: Commit**

```bash
git add 'src/app/(app)/dashboard/'
git commit -m "feat(app): dashboard page listing user sites"
```

---

### Task 33: `/sites/new` page

**Files:**
- Create: `src/app/(app)/sites/new/page.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/app/(app)/sites/new/page.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { SiteForm, type SiteFormValues } from '@/components/sites/site-form';

export default function NewSitePage() {
  const router = useRouter();
  const mutation = useMutation({
    mutationFn: async (v: SiteFormValues) => {
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(v),
      });
      if (!res.ok) throw new Error((await res.json()).error?.message ?? 'Failed');
      return res.json() as Promise<{ site: { id: number }; webhookToken: string }>;
    },
    onSuccess: ({ site, webhookToken }) => {
      sessionStorage.setItem(`fresh-token-${site.id}`, webhookToken);
      router.push(`/sites/${site.id}`);
    },
  });

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="display-lg mb-6 text-ink">New site</h1>
      <SiteForm onSubmit={(v) => mutation.mutate(v)} />
      {mutation.error && (
        <p className="mt-4 text-sm text-destructive">{(mutation.error as Error).message}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Smoke check** — submit a new site, confirm redirect to `/sites/[id]` and `sessionStorage` carries the fresh token.

- [ ] **Step 3: Commit**

```bash
git add 'src/app/(app)/sites/new/'
git commit -m "feat(app): new site form page"
```

---

### Task 34: `/sites/[id]` page

**Files:**
- Create: `src/app/(app)/sites/[id]/page.tsx`
- Create: `src/app/(app)/sites/[id]/site-detail-client.tsx`

- [ ] **Step 1: Implement server page**

```tsx
// src/app/(app)/sites/[id]/page.tsx
import { eq, desc } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { sites, generations } from '@/db/schema';
import { requireUser } from '@/lib/auth-guards';
import { SiteDetailClient } from './site-detail-client';

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const siteId = Number(id);
  const user = await requireUser();
  if (!Number.isInteger(siteId) || siteId <= 0) notFound();

  const [site] = await getDb()
    .select()
    .from(sites)
    .where(eq(sites.id, siteId));
  if (!site || site.userId !== user.id) notFound();

  const recent = await getDb()
    .select()
    .from(generations)
    .where(eq(generations.siteId, siteId))
    .orderBy(desc(generations.createdAt))
    .limit(20);

  return <SiteDetailClient site={site} initialGenerations={recent} />;
}
```

- [ ] **Step 2: Implement client wrapper**

```tsx
// src/app/(app)/sites/[id]/site-detail-client.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import type { Site, Generation } from '@/db/schema';
import { WebhookBlock } from '@/components/sites/webhook-block';
import { GenerationsTable } from '@/components/generations/generations-table';
import { RegenerateButton } from '@/components/generations/regenerate-button';

export function SiteDetailClient({
  site,
  initialGenerations,
}: {
  site: Site;
  initialGenerations: Generation[];
}) {
  const router = useRouter();
  const [freshToken, setFreshToken] = useState<string | null>(null);

  useEffect(() => {
    const key = `fresh-token-${site.id}`;
    const t = sessionStorage.getItem(key);
    if (t) {
      setFreshToken(t);
      sessionStorage.removeItem(key);
    }
  }, [site.id]);

  const rotate = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/sites/${site.id}/rotate-token`, { method: 'POST' });
      if (!res.ok) throw new Error('Rotate failed');
      return res.json() as Promise<{ webhookToken: string }>;
    },
    onSuccess: ({ webhookToken }) => setFreshToken(webhookToken),
  });

  const regen = useMutation({
    mutationFn: async (v: { siteId: number; notifyEmail: boolean }) => {
      const res = await fetch('/api/generations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(v),
      });
      if (!res.ok) throw new Error('Regenerate failed');
      return res.json() as Promise<{ generation: { id: number } }>;
    },
    onSuccess: ({ generation }) => router.push(`/g/${generation.id}`),
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="display-lg text-ink">{site.name}</h1>
          <p className="text-body">{site.rootUrl}</p>
        </div>
        <RegenerateButton siteId={site.id} onSubmit={(v) => regen.mutate(v)} />
      </div>

      <WebhookBlock
        siteId={site.id}
        tokenPrefix={site.webhookTokenPrefix}
        freshToken={freshToken ?? undefined}
        onRotate={() => rotate.mutate()}
      />

      <section>
        <h2 className="display-md mb-4 text-ink">Recent generations</h2>
        <GenerationsTable generations={initialGenerations} />
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Smoke check** — open the site, see webhook block + generations table; click Rotate token; click Regenerate.

- [ ] **Step 4: Commit**

```bash
git add 'src/app/(app)/sites/[id]/'
git commit -m "feat(app): site detail with webhook block + generations"
```

---

### Task 35: `/g/[id]` generation detail page with SSE

**Files:**
- Create: `src/app/(app)/g/[id]/page.tsx`
- Create: `src/app/(app)/g/[id]/generation-client.tsx`

- [ ] **Step 1: Implement server page**

```tsx
// src/app/(app)/g/[id]/page.tsx
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { getDb } from '@/db';
import { generations } from '@/db/schema';
import { requireUser } from '@/lib/auth-guards';
import { GenerationClient } from './generation-client';

export default async function GenerationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const genId = Number(id);
  const user = await requireUser();
  if (!Number.isInteger(genId) || genId <= 0) notFound();
  const [row] = await getDb().select().from(generations).where(eq(generations.id, genId));
  if (!row || row.userId !== user.id) notFound();
  return <GenerationClient initial={row} />;
}
```

- [ ] **Step 2: Implement client with SSE**

```tsx
// src/app/(app)/g/[id]/generation-client.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import type { Generation } from '@/db/schema';
import { GenerationDetailCard } from '@/components/generations/generation-detail-card';

export function GenerationClient({ initial }: { initial: Generation }) {
  const router = useRouter();
  const [generation, setGeneration] = useState<Generation>(initial);

  useEffect(() => {
    if (['succeeded', 'failed', 'cancelled'].includes(initial.status)) return;
    const es = new EventSource(`/api/generations/${initial.id}/stream`);
    es.addEventListener('status', (e) => {
      const next = JSON.parse((e as MessageEvent).data);
      setGeneration((prev) => ({ ...prev, ...next }));
    });
    es.onerror = () => es.close();
    return () => es.close();
  }, [initial.id, initial.status]);

  const cancel = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/generations/${generation.id}/cancel`, { method: 'POST' });
      if (!res.ok) throw new Error('Cancel failed');
      return res.json() as Promise<{ generation: Generation }>;
    },
    onSuccess: ({ generation: g }) => setGeneration(g),
  });

  const retry = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/generations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ siteId: generation.siteId }),
      });
      if (!res.ok) throw new Error('Retry failed');
      return res.json() as Promise<{ generation: { id: number } }>;
    },
    onSuccess: ({ generation: g }) => router.push(`/g/${g.id}`),
  });

  return (
    <GenerationDetailCard
      generation={generation}
      onRetry={() => retry.mutate()}
      onCancel={() => cancel.mutate()}
    />
  );
}
```

- [ ] **Step 3: Smoke check** — kick off a generation, watch SSE events flip status pills, see downloads enable.

- [ ] **Step 4: Commit**

```bash
git add 'src/app/(app)/g/[id]/'
git commit -m "feat(app): generation detail page with SSE live updates"
```

---

### Task 36: Landing page rewrite

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Replace contents**

```tsx
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
          store your site\'s content — only the generated text files for your re-download.
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
```

- [ ] **Step 2: Smoke check** — `/` shows the new pitch and CTAs.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(app): landing page rewrite for make-a-llms.txt"
```

---

## Phase 8 — Ops + final verification

### Task 37: Daily orphan-blob cleanup cron

**Files:**
- Create: `src/app/api/cron/cleanup-orphans/route.ts`
- Create: `src/app/api/cron/cleanup-orphans/route.test.ts`
- Modify: `vercel.json` (or create it)

- [ ] **Step 1: Test**

```ts
// route.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { generations, sites, users } from '@/db/schema';

const delSpy = vi.fn(async () => {});
vi.mock('@vercel/blob', () => ({ del: (...a: any[]) => delSpy(...a) }));

import { GET } from './route';

describe('cleanup orphans cron', () => {
  beforeEach(() => {
    delSpy.mockClear();
    process.env.CRON_SECRET = 'test-secret';
  });

  it('401 without bearer', async () => {
    const res = await GET(new Request('http://t/api/cron/cleanup-orphans'));
    expect(res.status).toBe(401);
  });

  it('deletes blobs for cancelled/failed older than 1h', async () => {
    await setupTestDb();
    const db = getDb();
    const [u] = await db.insert(users).values({ name: 'A', email: 'a@a.test' }).returning();
    const [s] = await db
      .insert(sites)
      .values({
        userId: u.id,
        name: 'S',
        rootUrl: 'https://s.test',
        webhookTokenHash: 'a'.repeat(64),
        webhookTokenPrefix: 'lmt_aaaa',
      })
      .returning();
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await db.insert(generations).values({
      siteId: s.id,
      userId: u.id,
      trigger: 'manual',
      status: 'cancelled',
      llmsBlobPath: 'gens/1/llms.txt',
      llmsFullBlobPath: 'gens/1/llms-full.txt',
      createdAt: old,
      updatedAt: old,
    });

    const res = await GET(
      new Request('http://t/api/cron/cleanup-orphans', {
        headers: { authorization: 'Bearer test-secret' },
      }),
    );
    expect(res.status).toBe(200);
    expect(delSpy).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run, expect fail**

```bash
pnpm test src/app/api/cron/cleanup-orphans/route.test.ts
```

- [ ] **Step 3: Implement**

```ts
// src/app/api/cron/cleanup-orphans/route.ts
import { and, inArray, lt, isNotNull, or } from 'drizzle-orm';
import { del } from '@vercel/blob';
import { getDb } from '@/db';
import { generations } from '@/db/schema';

const ONE_HOUR_MS = 60 * 60 * 1000;

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const cutoff = new Date(Date.now() - ONE_HOUR_MS).toISOString();
  const orphans = await getDb()
    .select()
    .from(generations)
    .where(
      and(
        inArray(generations.status, ['cancelled', 'failed']),
        lt(generations.createdAt, cutoff),
        or(isNotNull(generations.llmsBlobPath), isNotNull(generations.llmsFullBlobPath)),
      ),
    );

  let deleted = 0;
  for (const g of orphans) {
    if (g.llmsBlobPath) {
      try {
        await del(`https://blob.vercel-storage.com/${g.llmsBlobPath}`);
        deleted++;
      } catch (err) {
        console.warn('[cron] del failed', g.llmsBlobPath, err);
      }
    }
    if (g.llmsFullBlobPath) {
      try {
        await del(`https://blob.vercel-storage.com/${g.llmsFullBlobPath}`);
        deleted++;
      } catch (err) {
        console.warn('[cron] del failed', g.llmsFullBlobPath, err);
      }
    }
  }

  return Response.json({ deleted });
}
```

- [ ] **Step 4: Add cron to `vercel.json`**

Create or update `vercel.json` at repo root:

```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-orphans",
      "schedule": "0 4 * * *"
    }
  ]
}
```

- [ ] **Step 5: Add `CRON_SECRET` to `.env.example`**

```
CRON_SECRET=<generate with: openssl rand -base64 32>
```

- [ ] **Step 6: Run, expect pass**

```bash
pnpm test src/app/api/cron/cleanup-orphans/route.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/app/api/cron/ vercel.json .env.example
git commit -m "feat(ops): daily orphan-blob cleanup cron"
```

---

### Task 38: End-to-end happy path test + final verification

**Files:**
- Create: `src/test/e2e/generation-happy-path.test.ts`

- [ ] **Step 1: Write E2E test**

```ts
// src/test/e2e/generation-happy-path.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Readable } from 'node:stream';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { users, generations } from '@/db/schema';
import { eq } from 'drizzle-orm';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));
vi.mock('workflow', () => ({
  workflow: (_n: string, fn: any) => fn,
  step: { run: async (_n: string, f: any) => f(), parallel: async (fns: any[]) => Promise.all(fns.map((f) => f())) },
}));
const startMock = vi.fn(async () => ({ runId: 'wf-1' }));
vi.mock('workflow/api', () => ({ start: startMock, cancel: vi.fn() }));

vi.mock('execa', () => ({
  execa: vi.fn(() => {
    const p: any = Promise.resolve({ stdout: '# fixture\n', stderr: '', exitCode: 0 });
    p.stdout = Readable.from([Buffer.from('# fixture\n')]);
    p.stderr = Readable.from([]);
    return p;
  }),
}));
vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (path: string) => ({ url: `https://blob.test/${path}`, pathname: path })),
}));
vi.mock('@/lib/sitemap-discover', () => ({
  discoverSitemap: vi.fn(async () => 'https://acme.com/sitemap.xml'),
}));

const sentEmails: any[] = [];
vi.mock('resend', () => ({
  Resend: vi.fn(() => ({
    emails: { send: vi.fn(async (m: any) => sentEmails.push(m)) },
  })),
}));

import { POST as POST_GENERATIONS } from '@/app/api/generations/route';
import { runGenerateSiteFiles } from '@/lib/workflow/generate-site-files';
import { getCurrentUser } from '@/lib/auth';

describe('generation happy path', () => {
  beforeEach(() => {
    sentEmails.length = 0;
    process.env.RESEND_API_KEY = 'test';
    process.env.PUBLIC_BASE_URL = 'http://t';
  });

  it('manual create → workflow → both files + email', async () => {
    await setupTestDb();
    const [u] = await getDb()
      .insert(users)
      .values({ name: 'A', email: 'a@a.test' })
      .returning();
    vi.mocked(getCurrentUser).mockResolvedValue(u);

    const res = await POST_GENERATIONS(
      new Request('http://t/api/generations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Acme', rootUrl: 'https://acme.com', notifyEmail: true }),
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    const generationId: number = body.generation.id;

    // Run the workflow inline (production would do this via start()).
    await runGenerateSiteFiles({ generationId });

    const [g] = await getDb()
      .select()
      .from(generations)
      .where(eq(generations.id, generationId));
    expect(g.status).toBe('succeeded');
    expect(g.llmsBlobPath).toBe(`gens/${generationId}/llms.txt`);
    expect(g.llmsFullBlobPath).toBe(`gens/${generationId}/llms-full.txt`);
    expect(g.notifiedAt).not.toBeNull();
    expect(sentEmails.length).toBe(1);
    expect(sentEmails[0].to).toBe('a@a.test');
  });
});
```

- [ ] **Step 2: Run, expect pass**

```bash
pnpm test src/test/e2e/generation-happy-path.test.ts
```
Expected: 1 passed.

- [ ] **Step 3: Final verification gates**

Run these in order, all must pass:

```bash
pnpm lint
pnpm test
pnpm build
```

- [ ] **Step 4: Smoke run in dev**

```bash
pnpm dev
```

Manual flow check:
1. Open `http://localhost:3000/`. See landing copy. Click Sign up, complete OTP.
2. Land on `/dashboard`, see empty state. Click "+ New site".
3. Submit `Acme` / `https://acme.com`. Land on `/sites/[id]`, see fresh-token banner once.
4. Click "Regenerate", confirm with email-on. Land on `/g/[id]`. Watch status flip.
5. Once `succeeded`, click both download buttons; both files arrive.
6. Curl the webhook URL with bearer token; new generation appears in dashboard.
7. Curl webhook with bad token → 401.

- [ ] **Step 5: Commit E2E test**

```bash
git add src/test/e2e/
git commit -m "test: end-to-end happy path through workflow + email"
```

- [ ] **Step 6: Final commit if anything else changed**

```bash
git status
git add -A
git commit -m "chore: final cleanup"  # only if there's anything to commit
```

---

## Done

When all 38 tasks are complete:

- [x] Schema, libs, workflow, APIs, UI, ops all implemented and tested
- [x] `pnpm lint && pnpm test && pnpm build` green
- [x] Manual smoke pass through the dashboard flow + webhook
- [x] All commits atomic and descriptive

The product is ready for a Vercel preview deployment. Production rollout requires:
- `vercel link` + `vercel env pull` to populate secrets in Vercel.
- `BLOB_READ_WRITE_TOKEN`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SESSION_SECRET`, `CRON_SECRET`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `PUBLIC_BASE_URL` all set in Vercel env.
- `pnpm db:migrate` against the production Turso DB.








