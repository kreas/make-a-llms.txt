# Audit Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn failing audit findings into a per-site task list with an "Add task" button on each finding, a Tasks panel, manual check-off, won't-do flagging, and auto-verification when a re-audit shows the check passing.

**Architecture:** One new `site_tasks` table with a unique source key `(siteId, sourceType, sourceId, pageUrl)`. Three REST routes under `/api/sites/[id]/tasks` consumed via TanStack Query. Reconciliation is lazy: the GET route compares open/done tasks against the latest audit results (citation + geo adapters) and flips matches to `verified`. UI is a generic `AddTaskButton` dropped into finding rows plus a `TasksPanel` wired in as a new `?tab=tasks` panel.

**Tech Stack:** Next.js 16 App Router, Drizzle + Turso (SQLite), Zod, TanStack Query, Vitest + React Testing Library, DESIGN.md tokens.

**Spec:** `docs/superpowers/specs/2026-06-09-audit-tasks-design.md`

---

## Base branch — IMPORTANT

This feature builds on the tab/sidebar structure from PR #17
(`feat/site-detail-shell-restructure`), which is open but not yet merged.
All file excerpts of `site-detail-client.tsx` below refer to the PR #17
version (URL-backed `?tab=`, `VALID_TABS`, sidebar portal), NOT the version
currently on `main`.

- [ ] **Step 0: Create the working branch**

```bash
git checkout feat/site-detail-shell-restructure
git pull
git checkout -b feat/audit-tasks
# Bring in the spec + this plan from main:
git checkout main -- docs/superpowers/specs/2026-06-09-audit-tasks-design.md docs/superpowers/plans/2026-06-09-audit-tasks.md
git add docs && git commit -m "docs: carry audit tasks spec + plan onto feature branch"
```

If PR #17 has merged by the time you start, branch off `main` instead:
`git checkout main && git pull && git checkout -b feat/audit-tasks` (the
`git checkout main -- docs/...` step is then unnecessary).

---

### Task 1: `site_tasks` schema + migration

**Files:**
- Modify: `src/db/schema.ts` (append after `pageQuestionAnswersCache`, before any trailing exports)

- [ ] **Step 1: Add the table definition**

Append to `src/db/schema.ts` (the file already imports `index, integer, sqliteTable, text, unique` from `drizzle-orm/sqlite-core`, `sql` from `drizzle-orm`, and `generateUid` from `@/lib/uid`):

```ts
export const siteTasks = sqliteTable(
  'site_tasks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uid: text('uid').notNull().unique().$defaultFn(generateUid),
    siteId: integer('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    sourceType: text('source_type', {
      enum: ['citation-check', 'geo-signal', 'crawler-audit', 'setup'],
    }).notNull(),
    sourceId: text('source_id').notNull(),
    // '' (never NULL) for site-level tasks: SQLite treats NULLs as distinct in
    // unique indexes, which would break the one-task-per-finding guarantee.
    pageUrl: text('page_url').notNull().default(''),
    title: text('title').notNull(),
    foundText: text('found_text').notNull().default(''),
    fixText: text('fix_text').notNull().default(''),
    status: text('status', { enum: ['open', 'done', 'verified', 'wont_do'] })
      .notNull()
      .default('open'),
    createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
    statusChangedAt: text('status_changed_at')
      .notNull()
      .default(sql`(current_timestamp)`),
  },
  (t) => ({
    sourceKey: unique('site_tasks_source_key').on(
      t.siteId,
      t.sourceType,
      t.sourceId,
      t.pageUrl,
    ),
    bySiteStatus: index('site_tasks_by_site_status').on(t.siteId, t.status),
  }),
);

export type SiteTask = typeof siteTasks.$inferSelect;
export type NewSiteTask = typeof siteTasks.$inferInsert;
```

- [ ] **Step 2: Generate and run the migration**

Run: `pnpm db:generate`
Expected: a new file in `drizzle/` containing `CREATE TABLE site_tasks` with the unique constraint.

Run: `pnpm db:migrate`
Expected: exits 0.

- [ ] **Step 3: Verify the suite still passes**

Run: `pnpm test --run`
Expected: all tests pass (the test DB applies the schema via `@/test/db`).

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat: add site_tasks table for audit-derived tasks"
```

---

### Task 2: Pure reconcile + serialize helpers

**Files:**
- Create: `src/lib/tasks/reconcile.ts`
- Create: `src/lib/tasks/reconcile.test.ts`
- Create: `src/lib/tasks/serialize.ts`
- Create: `src/lib/tasks/serialize.test.ts`

These are pure functions: the route (Task 4) feeds them DB rows and parsed
audit JSON; nothing here touches the database. `reconcile.ts` is also imported
by client components (for `taskKey`), so it must stay dependency-free.

- [ ] **Step 1: Write the failing reconcile test**

`src/lib/tasks/reconcile.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  taskKey,
  citationPassedKeys,
  geoPassedKeys,
  findVerifiableUids,
} from './reconcile';

const task = (over: Partial<Parameters<typeof findVerifiableUids>[0][number]> = {}) => ({
  uid: 'u1',
  status: 'open' as const,
  sourceType: 'citation-check' as const,
  sourceId: 'schema-type',
  pageUrl: 'https://x.com/about',
  ...over,
});

describe('taskKey', () => {
  it('distinguishes the same check on different pages', () => {
    expect(taskKey(task())).not.toBe(taskKey(task({ pageUrl: 'https://x.com/' })));
  });

  it('distinguishes source types with the same id', () => {
    expect(taskKey(task())).not.toBe(taskKey(task({ sourceType: 'geo-signal' })));
  });
});

describe('citationPassedKeys', () => {
  it('returns keys only for passing checks, bound to the page URL', () => {
    const keys = citationPassedKeys('https://x.com/about', {
      checks: [
        { id: 'schema-type', passed: true },
        { id: 'h1-present', passed: false },
      ],
    });
    expect(keys).toEqual([
      taskKey({ sourceType: 'citation-check', sourceId: 'schema-type', pageUrl: 'https://x.com/about' }),
    ]);
  });
});

describe('geoPassedKeys', () => {
  it('returns keys for present signals with empty pageUrl', () => {
    const keys = geoPassedKeys({
      signals: [
        { signal: 'case-studies', present: true },
        { signal: 'pricing-clarity', present: false },
      ],
    });
    expect(keys).toEqual([
      taskKey({ sourceType: 'geo-signal', sourceId: 'case-studies', pageUrl: '' }),
    ]);
  });
});

describe('findVerifiableUids', () => {
  const passed = new Set([taskKey(task())]);

  it('verifies open tasks whose check now passes', () => {
    expect(findVerifiableUids([task()], passed)).toEqual(['u1']);
  });

  it('verifies done tasks too', () => {
    expect(findVerifiableUids([task({ status: 'done' })], passed)).toEqual(['u1']);
  });

  it('never touches wont_do or already-verified tasks', () => {
    expect(findVerifiableUids([task({ status: 'wont_do' })], passed)).toEqual([]);
    expect(findVerifiableUids([task({ status: 'verified' })], passed)).toEqual([]);
  });

  it('leaves tasks alone when their check is not in the passed set', () => {
    expect(findVerifiableUids([task({ sourceId: 'h1-present' })], passed)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test --run src/lib/tasks/reconcile.test.ts`
Expected: FAIL — cannot resolve `./reconcile`.

- [ ] **Step 3: Implement `reconcile.ts`**

```ts
import type { SiteTask } from '@/db/schema';

export type TaskSourceKey = Pick<SiteTask, 'sourceType' | 'sourceId' | 'pageUrl'>;

/** Stable identity for a finding. NUL separator cannot appear in the parts. */
export function taskKey(t: TaskSourceKey): string {
  return [t.sourceType, t.sourceId, t.pageUrl].join('\u0000');
}

type CitationResultsLike = { checks: { id: string; passed: boolean }[] };

export function citationPassedKeys(pageUrl: string, results: CitationResultsLike): string[] {
  return results.checks
    .filter((c) => c.passed)
    .map((c) => taskKey({ sourceType: 'citation-check', sourceId: c.id, pageUrl }));
}

type GeoResultsLike = { signals: { signal: string; present: boolean }[] };

export function geoPassedKeys(results: GeoResultsLike): string[] {
  return results.signals
    .filter((s) => s.present)
    .map((s) => taskKey({ sourceType: 'geo-signal', sourceId: s.signal, pageUrl: '' }));
}

type ReconcilableTask = Pick<SiteTask, 'uid' | 'status' | 'sourceType' | 'sourceId' | 'pageUrl'>;

/** Open/done tasks whose source check now passes. wont_do is never touched. */
export function findVerifiableUids(tasks: ReconcilableTask[], passedKeys: Set<string>): string[] {
  return tasks
    .filter((t) => (t.status === 'open' || t.status === 'done') && passedKeys.has(taskKey(t)))
    .map((t) => t.uid);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test --run src/lib/tasks/reconcile.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Write the failing serialize test**

`src/lib/tasks/serialize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { serializeSiteTask } from './serialize';
import type { SiteTask } from '@/db/schema';

describe('serializeSiteTask', () => {
  it('exposes uid as id and omits numeric ids', () => {
    const row: SiteTask = {
      id: 7,
      uid: 'task-uid-1',
      siteId: 3,
      sourceType: 'citation-check',
      sourceId: 'schema-type',
      pageUrl: 'https://x.com/about',
      title: 'Schema.org type',
      foundText: 'Unrecognized @type(s): JobPosting',
      fixText: 'Declare a Schema.org @type appropriate for this page.',
      status: 'open',
      createdAt: '2026-06-09T00:00:00Z',
      statusChangedAt: '2026-06-09T00:00:00Z',
    };
    const s = serializeSiteTask(row);
    expect(s.id).toBe('task-uid-1');
    expect(s).not.toHaveProperty('uid');
    expect(s).not.toHaveProperty('siteId');
    expect(s.status).toBe('open');
  });
});
```

- [ ] **Step 6: Run it to verify it fails, then implement `serialize.ts`**

Run: `pnpm test --run src/lib/tasks/serialize.test.ts` — expected FAIL.

```ts
import type { SiteTask } from '@/db/schema';

export type SerializedSiteTask = {
  id: string;
  sourceType: SiteTask['sourceType'];
  sourceId: string;
  pageUrl: string;
  title: string;
  foundText: string;
  fixText: string;
  status: SiteTask['status'];
  createdAt: string;
  statusChangedAt: string;
};

export function serializeSiteTask(t: SiteTask): SerializedSiteTask {
  return {
    id: t.uid,
    sourceType: t.sourceType,
    sourceId: t.sourceId,
    pageUrl: t.pageUrl,
    title: t.title,
    foundText: t.foundText,
    fixText: t.fixText,
    status: t.status,
    createdAt: t.createdAt,
    statusChangedAt: t.statusChangedAt,
  };
}
```

- [ ] **Step 7: Run both tests, then commit**

Run: `pnpm test --run src/lib/tasks/`
Expected: PASS.

```bash
git add src/lib/tasks/
git commit -m "feat: add pure reconcile and serialize helpers for site tasks"
```

---

### Task 3: Zod validators

**Files:**
- Create: `src/lib/validators/site-tasks.ts`
- Create: `src/lib/validators/site-tasks.test.ts`

- [ ] **Step 1: Write the failing test**

`src/lib/validators/site-tasks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createSiteTaskBodySchema, patchSiteTaskBodySchema } from './site-tasks';

describe('createSiteTaskBodySchema', () => {
  it('accepts a citation-check payload and defaults optional fields', () => {
    const r = createSiteTaskBodySchema.parse({
      sourceType: 'citation-check',
      sourceId: 'schema-type',
      pageUrl: 'https://x.com/about',
      title: 'Schema.org type',
    });
    expect(r.foundText).toBe('');
    expect(r.fixText).toBe('');
  });

  it('defaults pageUrl to empty string for site-level findings', () => {
    const r = createSiteTaskBodySchema.parse({
      sourceType: 'geo-signal',
      sourceId: 'case-studies',
      title: 'Case studies',
    });
    expect(r.pageUrl).toBe('');
  });

  it('rejects unknown sourceType and empty sourceId/title', () => {
    expect(() => createSiteTaskBodySchema.parse({ sourceType: 'nope', sourceId: 'x', title: 'y' })).toThrow();
    expect(() => createSiteTaskBodySchema.parse({ sourceType: 'setup', sourceId: '', title: 'y' })).toThrow();
    expect(() => createSiteTaskBodySchema.parse({ sourceType: 'setup', sourceId: 'x', title: '' })).toThrow();
  });
});

describe('patchSiteTaskBodySchema', () => {
  it('accepts manual statuses only', () => {
    expect(patchSiteTaskBodySchema.parse({ status: 'done' }).status).toBe('done');
    expect(patchSiteTaskBodySchema.parse({ status: 'open' }).status).toBe('open');
    expect(patchSiteTaskBodySchema.parse({ status: 'wont_do' }).status).toBe('wont_do');
  });

  it('rejects verified (system-set only)', () => {
    expect(() => patchSiteTaskBodySchema.parse({ status: 'verified' })).toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test --run src/lib/validators/site-tasks.test.ts`
Expected: FAIL — cannot resolve `./site-tasks`.

- [ ] **Step 3: Implement (mirrors `src/lib/validators/citation-audits.ts` style)**

```ts
import { z } from 'zod';

export const createSiteTaskBodySchema = z
  .object({
    sourceType: z.enum(['citation-check', 'geo-signal', 'crawler-audit', 'setup']),
    sourceId: z.string().min(1),
    pageUrl: z.string().default(''),
    title: z.string().min(1),
    foundText: z.string().default(''),
    fixText: z.string().default(''),
  })
  .strict();

export const patchSiteTaskBodySchema = z
  .object({
    // 'verified' is intentionally absent: it is system-set by reconciliation.
    status: z.enum(['open', 'done', 'wont_do']),
  })
  .strict();

export type CreateSiteTaskBody = z.infer<typeof createSiteTaskBodySchema>;
export type PatchSiteTaskBody = z.infer<typeof patchSiteTaskBodySchema>;
```

- [ ] **Step 4: Run the test, then commit**

Run: `pnpm test --run src/lib/validators/site-tasks.test.ts`
Expected: PASS.

```bash
git add src/lib/validators/site-tasks.ts src/lib/validators/site-tasks.test.ts
git commit -m "feat: add site task validators"
```

---

### Task 4: GET + POST `/api/sites/[id]/tasks`

**Files:**
- Create: `src/app/api/sites/[id]/tasks/route.ts`
- Create: `src/app/api/sites/[id]/tasks/route.test.ts`

Follow the exact guard/error pattern from
`src/app/api/sites/[id]/citation-audits/route.ts` (`requireUserOrThrow`,
`assertOwnsSiteByUid`, `ApiError`, `apiErrorResponse`, `parseUid`).

- [ ] **Step 1: Write the failing tests**

`src/app/api/sites/[id]/tasks/route.test.ts` (test scaffolding copied from
`citation-audits/route.test.ts` — `setupTestDb`, `makeUserAndSite`, `ctx`):

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users, siteTasks, citationAudits, siteGeoAudits } from '@/db/schema';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));

import { GET, POST } from './route';
import { getCurrentUser } from '@/lib/auth';

async function makeUserAndSite(email: string) {
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'X', email }).returning();
  const prefix = email.split('@')[0].slice(0, 4).padEnd(4, 'x');
  const hash = prefix.repeat(16);
  const [s] = await db
    .insert(sites)
    .values({
      userId: u.id,
      name: 'S',
      rootUrl: `https://${email.split('@')[0]}.test`,
      webhookTokenHash: hash,
      webhookTokenPrefix: `lmt_${prefix}`,
    })
    .returning();
  return { user: u, site: s };
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const CHECK_TASK = {
  sourceType: 'citation-check',
  sourceId: 'schema-type',
  pageUrl: 'https://x.com/about',
  title: 'Schema.org type',
  foundText: 'Unrecognized @type(s): JobPosting',
  fixText: 'Declare a Schema.org @type appropriate for this page.',
};

function postReq(body: unknown) {
  return new Request('http://t', { method: 'POST', body: JSON.stringify(body) });
}

beforeEach(async () => {
  await setupTestDb();
});

describe('POST /api/sites/[id]/tasks', () => {
  it('returns 401 when unauthenticated', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await POST(postReq(CHECK_TASK), ctx(site.uid));
    expect(res.status).toBe(401);
  });

  it('returns 404 for cross-tenant site', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    const { user: other } = await makeUserAndSite('b@b.test');
    vi.mocked(getCurrentUser).mockResolvedValue(other);
    const res = await POST(postReq(CHECK_TASK), ctx(site.uid));
    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid body', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const res = await POST(postReq({ sourceType: 'nope' }), ctx(site.uid));
    expect(res.status).toBe(400);
  });

  it('creates an open task', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const res = await POST(postReq(CHECK_TASK), ctx(site.uid));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.task.status).toBe('open');
    expect(body.task.sourceId).toBe('schema-type');
    expect(typeof body.task.id).toBe('string');
  });

  it('is idempotent: second POST for the same finding returns the existing task', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const first = await (await POST(postReq(CHECK_TASK), ctx(site.uid))).json();
    const second = await (await POST(postReq(CHECK_TASK), ctx(site.uid))).json();
    expect(second.task.id).toBe(first.task.id);
    const rows = await getDb().select().from(siteTasks);
    expect(rows).toHaveLength(1);
  });
});

describe('GET /api/sites/[id]/tasks', () => {
  it('returns 401 when unauthenticated', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(new Request('http://t'), ctx(site.uid));
    expect(res.status).toBe(401);
  });

  it('orders tasks open, done, verified, wont_do', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const db = getDb();
    const base = { siteId: site.id, sourceType: 'citation-check' as const, pageUrl: 'https://x.com/p', title: 'T' };
    await db.insert(siteTasks).values([
      { ...base, sourceId: 'c1', status: 'wont_do' },
      { ...base, sourceId: 'c2', status: 'open' },
      { ...base, sourceId: 'c3', status: 'done' },
      { ...base, sourceId: 'c4', status: 'verified' },
    ]);
    const res = await GET(new Request('http://t'), ctx(site.uid));
    const body = await res.json();
    expect(body.tasks.map((t: { status: string }) => t.status)).toEqual([
      'open', 'done', 'verified', 'wont_do',
    ]);
  });

  it('reconciles: flips an open citation task to verified when the latest audit passes the check', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const db = getDb();
    await db.insert(siteTasks).values({
      siteId: site.id, sourceType: 'citation-check', sourceId: 'schema-type',
      pageUrl: 'https://x.com/about', title: 'Schema.org type', status: 'open',
    });
    await db.insert(citationAudits).values({
      siteId: site.id, pageUrl: 'https://x.com/about', status: 'succeeded', trigger: 'manual',
      fetchedAt: '2026-06-09T00:00:00Z',
      results: JSON.stringify({ checks: [{ id: 'schema-type', passed: true }] }),
    });
    const res = await GET(new Request('http://t'), ctx(site.uid));
    const body = await res.json();
    expect(body.tasks[0].status).toBe('verified');
  });

  it('reconciles only against the LATEST audit for the page', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const db = getDb();
    await db.insert(siteTasks).values({
      siteId: site.id, sourceType: 'citation-check', sourceId: 'schema-type',
      pageUrl: 'https://x.com/about', title: 'Schema.org type', status: 'open',
    });
    // Older audit passes, newer audit fails: task must stay open.
    await db.insert(citationAudits).values([
      { siteId: site.id, pageUrl: 'https://x.com/about', status: 'succeeded', trigger: 'manual',
        fetchedAt: '2026-06-01T00:00:00Z',
        results: JSON.stringify({ checks: [{ id: 'schema-type', passed: true }] }) },
      { siteId: site.id, pageUrl: 'https://x.com/about', status: 'succeeded', trigger: 'manual',
        fetchedAt: '2026-06-08T00:00:00Z',
        results: JSON.stringify({ checks: [{ id: 'schema-type', passed: false }] }) },
    ]);
    const res = await GET(new Request('http://t'), ctx(site.uid));
    const body = await res.json();
    expect(body.tasks[0].status).toBe('open');
  });

  it('reconciles geo-signal tasks against the latest geo audit but never wont_do', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const db = getDb();
    await db.insert(siteTasks).values([
      { siteId: site.id, sourceType: 'geo-signal', sourceId: 'case-studies', title: 'Case studies', status: 'open' },
      { siteId: site.id, sourceType: 'geo-signal', sourceId: 'pricing-clarity', title: 'Pricing', status: 'wont_do' },
    ]);
    await db.insert(siteGeoAudits).values({
      siteId: site.id, status: 'succeeded', trigger: 'manual',
      fetchedAt: '2026-06-09T00:00:00Z',
      results: JSON.stringify({
        signals: [
          { signal: 'case-studies', present: true },
          { signal: 'pricing-clarity', present: true },
        ],
      }),
    });
    const res = await GET(new Request('http://t'), ctx(site.uid));
    const body = await res.json();
    const byId = Object.fromEntries(body.tasks.map((t: { sourceId: string; status: string }) => [t.sourceId, t.status]));
    expect(byId['case-studies']).toBe('verified');
    expect(byId['pricing-clarity']).toBe('wont_do');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test --run "src/app/api/sites/\[id\]/tasks/route.test.ts"`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Implement the route**

`src/app/api/sites/[id]/tasks/route.ts`:

```ts
import { ZodError } from 'zod';
import { and, eq, desc, inArray } from 'drizzle-orm';
import { getDb } from '@/db';
import { siteTasks, citationAudits, siteGeoAudits, type SiteTask } from '@/db/schema';
import { ApiError, apiErrorResponse, assertOwnsSiteByUid, requireUserOrThrow } from '@/lib/auth-guards';
import { parseUid } from '@/lib/uid';
import { createSiteTaskBodySchema } from '@/lib/validators/site-tasks';
import { citationPassedKeys, geoPassedKeys, findVerifiableUids } from '@/lib/tasks/reconcile';
import { serializeSiteTask } from '@/lib/tasks/serialize';

type Ctx = { params: Promise<{ id: string }> };

async function parseSiteUid(ctx: Ctx): Promise<string> {
  const { id } = await ctx.params;
  try {
    return parseUid(id);
  } catch (e) {
    if (e instanceof ZodError) throw new ApiError(400, 'validation', 'Site id must be a UUID');
    throw e;
  }
}

const STATUS_ORDER: Record<SiteTask['status'], number> = {
  open: 0,
  done: 1,
  verified: 2,
  wont_do: 3,
};

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const uid = await parseSiteUid(ctx);
    const site = await assertOwnsSiteByUid(uid, user.id);
    const db = getDb();

    let tasks = await db.select().from(siteTasks).where(eq(siteTasks.siteId, site.id));
    const candidates = tasks.filter((t) => t.status === 'open' || t.status === 'done');
    const passedKeys = new Set<string>();

    // Citation adapter: latest succeeded audit per page among the candidates.
    const citationPages = [
      ...new Set(candidates.filter((t) => t.sourceType === 'citation-check').map((t) => t.pageUrl)),
    ];
    for (const pageUrl of citationPages) {
      const [latest] = await db
        .select()
        .from(citationAudits)
        .where(
          and(
            eq(citationAudits.siteId, site.id),
            eq(citationAudits.pageUrl, pageUrl),
            eq(citationAudits.status, 'succeeded'),
          ),
        )
        .orderBy(desc(citationAudits.fetchedAt))
        .limit(1);
      if (latest?.results) {
        for (const k of citationPassedKeys(pageUrl, JSON.parse(latest.results))) passedKeys.add(k);
      }
    }

    // Geo adapter: latest succeeded site-level geo audit.
    if (candidates.some((t) => t.sourceType === 'geo-signal')) {
      const [latestGeo] = await db
        .select()
        .from(siteGeoAudits)
        .where(and(eq(siteGeoAudits.siteId, site.id), eq(siteGeoAudits.status, 'succeeded')))
        .orderBy(desc(siteGeoAudits.fetchedAt))
        .limit(1);
      if (latestGeo?.results) {
        for (const k of geoPassedKeys(JSON.parse(latestGeo.results))) passedKeys.add(k);
      }
    }
    // crawler-audit / setup tasks have no reconciler yet: manual completion only.

    const toVerify = findVerifiableUids(candidates, passedKeys);
    if (toVerify.length > 0) {
      await db
        .update(siteTasks)
        .set({ status: 'verified', statusChangedAt: new Date().toISOString() })
        .where(inArray(siteTasks.uid, toVerify));
      tasks = await db.select().from(siteTasks).where(eq(siteTasks.siteId, site.id));
    }

    const ordered = [...tasks].sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        b.createdAt.localeCompare(a.createdAt),
    );
    return Response.json({ tasks: ordered.map(serializeSiteTask) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const uid = await parseSiteUid(ctx);
    const site = await assertOwnsSiteByUid(uid, user.id);
    const body = createSiteTaskBodySchema.safeParse(await req.json());
    if (!body.success) throw new ApiError(400, 'validation', body.error.message);
    const { sourceType, sourceId, pageUrl, title, foundText, fixText } = body.data;
    const db = getDb();

    const sourceKeyWhere = and(
      eq(siteTasks.siteId, site.id),
      eq(siteTasks.sourceType, sourceType),
      eq(siteTasks.sourceId, sourceId),
      eq(siteTasks.pageUrl, pageUrl),
    );
    const [existing] = await db.select().from(siteTasks).where(sourceKeyWhere);
    if (existing) return Response.json({ task: serializeSiteTask(existing) });

    try {
      const [created] = await db
        .insert(siteTasks)
        .values({ siteId: site.id, sourceType, sourceId, pageUrl, title, foundText, fixText })
        .returning();
      return Response.json({ task: serializeSiteTask(created) });
    } catch {
      // Unique-key race: a concurrent request inserted between select and insert.
      const [raced] = await db.select().from(siteTasks).where(sourceKeyWhere);
      if (raced) return Response.json({ task: serializeSiteTask(raced) });
      throw new ApiError(500, 'internal', 'Failed to create task');
    }
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test --run "src/app/api/sites/\[id\]/tasks/route.test.ts"`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/sites/[id]/tasks/"
git commit -m "feat: add tasks list/create API with reconcile-on-read"
```

---

### Task 5: PATCH `/api/sites/[id]/tasks/[taskUid]`

**Files:**
- Create: `src/app/api/sites/[id]/tasks/[taskUid]/route.ts`
- Create: `src/app/api/sites/[id]/tasks/[taskUid]/route.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/app/api/sites/[id]/tasks/[taskUid]/route.test.ts` (reuse the same
`makeUserAndSite` helper verbatim from Task 4's test file):

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users, siteTasks } from '@/db/schema';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));

import { PATCH } from './route';
import { getCurrentUser } from '@/lib/auth';

async function makeUserAndSite(email: string) {
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'X', email }).returning();
  const prefix = email.split('@')[0].slice(0, 4).padEnd(4, 'x');
  const hash = prefix.repeat(16);
  const [s] = await db
    .insert(sites)
    .values({
      userId: u.id,
      name: 'S',
      rootUrl: `https://${email.split('@')[0]}.test`,
      webhookTokenHash: hash,
      webhookTokenPrefix: `lmt_${prefix}`,
    })
    .returning();
  return { user: u, site: s };
}

const ctx = (id: string, taskUid: string) => ({ params: Promise.resolve({ id, taskUid }) });

function patchReq(body: unknown) {
  return new Request('http://t', { method: 'PATCH', body: JSON.stringify(body) });
}

async function makeTask(siteId: number, status: 'open' | 'done' | 'verified' | 'wont_do' = 'open') {
  const [t] = await getDb()
    .insert(siteTasks)
    .values({
      siteId, sourceType: 'citation-check', sourceId: `c-${status}`,
      pageUrl: 'https://x.com/p', title: 'T', status,
    })
    .returning();
  return t;
}

beforeEach(async () => {
  await setupTestDb();
});

describe('PATCH /api/sites/[id]/tasks/[taskUid]', () => {
  it('returns 401 when unauthenticated', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    const task = await makeTask(site.id);
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await PATCH(patchReq({ status: 'done' }), ctx(site.uid, task.uid));
    expect(res.status).toBe(401);
  });

  it('returns 404 for a task on another user\'s site', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    const { user: other } = await makeUserAndSite('b@b.test');
    const task = await makeTask(site.id);
    vi.mocked(getCurrentUser).mockResolvedValue(other);
    const res = await PATCH(patchReq({ status: 'done' }), ctx(site.uid, task.uid));
    expect(res.status).toBe(404);
  });

  it('returns 404 for an unknown task uid', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const res = await PATCH(
      patchReq({ status: 'done' }),
      ctx(site.uid, '00000000-0000-4000-8000-000000000000'),
    );
    expect(res.status).toBe(404);
  });

  it('rejects status verified with 400', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    const task = await makeTask(site.id);
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const res = await PATCH(patchReq({ status: 'verified' }), ctx(site.uid, task.uid));
    expect(res.status).toBe(400);
  });

  it('marks a task done and bumps statusChangedAt', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    const task = await makeTask(site.id);
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const res = await PATCH(patchReq({ status: 'done' }), ctx(site.uid, task.uid));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.task.status).toBe('done');
    expect(body.task.statusChangedAt).not.toBe(task.statusChangedAt);
  });

  it('reopens a verified task (regression case)', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    const task = await makeTask(site.id, 'verified');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const res = await PATCH(patchReq({ status: 'open' }), ctx(site.uid, task.uid));
    const body = await res.json();
    expect(body.task.status).toBe('open');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test --run "src/app/api/sites/\[id\]/tasks/\[taskUid\]/route.test.ts"`
Expected: FAIL — cannot resolve `./route`.

- [ ] **Step 3: Implement the route**

`src/app/api/sites/[id]/tasks/[taskUid]/route.ts`:

```ts
import { ZodError } from 'zod';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { siteTasks } from '@/db/schema';
import { ApiError, apiErrorResponse, assertOwnsSiteByUid, requireUserOrThrow } from '@/lib/auth-guards';
import { parseUid } from '@/lib/uid';
import { patchSiteTaskBodySchema } from '@/lib/validators/site-tasks';
import { serializeSiteTask } from '@/lib/tasks/serialize';

type Ctx = { params: Promise<{ id: string; taskUid: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const { id, taskUid } = await ctx.params;
    let siteUid: string;
    let parsedTaskUid: string;
    try {
      siteUid = parseUid(id);
      parsedTaskUid = parseUid(taskUid);
    } catch (e) {
      if (e instanceof ZodError) throw new ApiError(400, 'validation', 'Ids must be UUIDs');
      throw e;
    }
    const site = await assertOwnsSiteByUid(siteUid, user.id);
    const body = patchSiteTaskBodySchema.safeParse(await req.json());
    if (!body.success) throw new ApiError(400, 'validation', body.error.message);

    const db = getDb();
    const [updated] = await db
      .update(siteTasks)
      .set({ status: body.data.status, statusChangedAt: new Date().toISOString() })
      .where(and(eq(siteTasks.uid, parsedTaskUid), eq(siteTasks.siteId, site.id)))
      .returning();
    if (!updated) throw new ApiError(404, 'not_found', 'Task not found');
    return Response.json({ task: serializeSiteTask(updated) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test --run "src/app/api/sites/\[id\]/tasks/\[taskUid\]/route.test.ts"`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/sites/[id]/tasks/"
git commit -m "feat: add task status PATCH endpoint"
```

---

### Task 6: `useSiteTasks` hooks

**Files:**
- Create: `src/hooks/use-site-tasks.ts`
- Create: `src/hooks/use-site-tasks.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/hooks/use-site-tasks.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSiteTasks, useCreateSiteTask, useUpdateSiteTaskStatus } from './use-site-tasks';

const TASK = {
  id: 't1', sourceType: 'citation-check', sourceId: 'schema-type',
  pageUrl: 'https://x.com/about', title: 'Schema.org type',
  foundText: '', fixText: '', status: 'open',
  createdAt: '2026-06-09T00:00:00Z', statusChangedAt: '2026-06-09T00:00:00Z',
};

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ tasks: [TASK] }), { status: 200 })));
});

describe('useSiteTasks', () => {
  it('fetches the site task list', async () => {
    const { result } = renderHook(() => useSiteTasks('site-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.tasks).toHaveLength(1);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/sites/site-1/tasks');
  });
});

describe('useCreateSiteTask', () => {
  it('POSTs the finding payload', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ task: TASK }), { status: 200 })));
    const { result } = renderHook(() => useCreateSiteTask('site-1'), { wrapper });
    result.current.mutate({
      sourceType: 'citation-check', sourceId: 'schema-type',
      pageUrl: 'https://x.com/about', title: 'Schema.org type', foundText: '', fixText: '',
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/api/sites/site-1/tasks');
    expect((init as RequestInit).method).toBe('POST');
  });
});

describe('useUpdateSiteTaskStatus', () => {
  it('PATCHes the task status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ task: { ...TASK, status: 'done' } }), { status: 200 })));
    const { result } = renderHook(() => useUpdateSiteTaskStatus('site-1'), { wrapper });
    result.current.mutate({ taskId: 't1', status: 'done' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/api/sites/site-1/tasks/t1');
    expect((init as RequestInit).method).toBe('PATCH');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test --run src/hooks/use-site-tasks.test.tsx`
Expected: FAIL — cannot resolve `./use-site-tasks`.

- [ ] **Step 3: Implement the hooks**

`src/hooks/use-site-tasks.ts`:

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SiteTask } from '@/db/schema';
import type { SerializedSiteTask } from '@/lib/tasks/serialize';

export type TaskFinding = {
  sourceType: SiteTask['sourceType'];
  sourceId: string;
  pageUrl?: string;
  title: string;
  foundText: string;
  fixText: string;
};

export function useSiteTasks(siteUid: string) {
  return useQuery({
    queryKey: ['siteTasks', siteUid],
    queryFn: async (): Promise<{ tasks: SerializedSiteTask[] }> => {
      const res = await fetch(`/api/sites/${siteUid}/tasks`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      return res.json();
    },
  });
}

export function useCreateSiteTask(siteUid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (finding: TaskFinding): Promise<{ task: SerializedSiteTask }> => {
      const res = await fetch(`/api/sites/${siteUid}/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(finding),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? 'Failed to add task');
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['siteTasks', siteUid] }),
  });
}

export function useUpdateSiteTaskStatus(siteUid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      taskId: string;
      status: 'open' | 'done' | 'wont_do';
    }): Promise<{ task: SerializedSiteTask }> => {
      const res = await fetch(`/api/sites/${siteUid}/tasks/${input.taskId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: input.status }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? 'Failed to update task');
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['siteTasks', siteUid] }),
  });
}
```

- [ ] **Step 4: Run the test, then commit**

Run: `pnpm test --run src/hooks/use-site-tasks.test.tsx`
Expected: PASS (3 tests).

```bash
git add src/hooks/use-site-tasks.ts src/hooks/use-site-tasks.test.tsx
git commit -m "feat: add site task TanStack Query hooks"
```

---

### Task 7: `AddTaskButton`

**Files:**
- Create: `src/components/tasks/add-task-button.tsx`
- Create: `src/components/tasks/add-task-button.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/components/tasks/add-task-button.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddTaskButton } from './add-task-button';

const mutate = vi.fn();
let tasksData: { tasks: unknown[] } | undefined = { tasks: [] };

vi.mock('@/hooks/use-site-tasks', () => ({
  useSiteTasks: () => ({ data: tasksData, isLoading: false }),
  useCreateSiteTask: () => ({ mutate, isPending: false }),
}));

const FINDING = {
  sourceType: 'citation-check' as const,
  sourceId: 'schema-type',
  pageUrl: 'https://x.com/about',
  title: 'Schema.org type',
  foundText: 'Unrecognized @type(s): JobPosting',
  fixText: 'Declare a Schema.org @type appropriate for this page.',
};

const existing = (status: string) => ({
  id: 't1', sourceType: 'citation-check', sourceId: 'schema-type',
  pageUrl: 'https://x.com/about', title: 'Schema.org type',
  foundText: '', fixText: '', status,
  createdAt: '', statusChangedAt: '',
});

beforeEach(() => {
  mutate.mockClear();
  tasksData = { tasks: [] };
});

describe('AddTaskButton', () => {
  it('creates a task on click when none exists', () => {
    render(<AddTaskButton siteUid="s1" finding={FINDING} />);
    fireEvent.click(screen.getByRole('button', { name: /add task/i }));
    expect(mutate).toHaveBeenCalledWith(FINDING);
  });

  it('shows Added for an open task', () => {
    tasksData = { tasks: [existing('open')] };
    render(<AddTaskButton siteUid="s1" finding={FINDING} />);
    expect(screen.getByText('Added')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows Done for done and verified tasks', () => {
    tasksData = { tasks: [existing('verified')] };
    render(<AddTaskButton siteUid="s1" finding={FINDING} />);
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it("shows Won't do for wont_do tasks", () => {
    tasksData = { tasks: [existing('wont_do')] };
    render(<AddTaskButton siteUid="s1" finding={FINDING} />);
    expect(screen.getByText("Won't do")).toBeInTheDocument();
  });

  it('does not match a task for a different page', () => {
    tasksData = { tasks: [{ ...existing('open'), pageUrl: 'https://x.com/other' }] };
    render(<AddTaskButton siteUid="s1" finding={FINDING} />);
    expect(screen.getByRole('button', { name: /add task/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test --run src/components/tasks/add-task-button.test.tsx`
Expected: FAIL — cannot resolve `./add-task-button`.

- [ ] **Step 3: Implement the component**

`src/components/tasks/add-task-button.tsx`:

```tsx
'use client';

import { Plus, Check, Ban } from 'lucide-react';
import { useSiteTasks, useCreateSiteTask, type TaskFinding } from '@/hooks/use-site-tasks';
import { taskKey } from '@/lib/tasks/reconcile';

export function AddTaskButton({ siteUid, finding }: { siteUid: string; finding: TaskFinding }) {
  const tasksQuery = useSiteTasks(siteUid);
  const create = useCreateSiteTask(siteUid);

  const key = taskKey({
    sourceType: finding.sourceType,
    sourceId: finding.sourceId,
    pageUrl: finding.pageUrl ?? '',
  });
  const existing = tasksQuery.data?.tasks.find((t) => taskKey(t) === key);

  if (existing) {
    const label =
      existing.status === 'open' ? 'Added' : existing.status === 'wont_do' ? "Won't do" : 'Done';
    const Icon = existing.status === 'wont_do' ? Ban : Check;
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-hairline bg-canvas-soft px-2 py-1 text-xs text-muted-strong">
        <Icon className="h-3 w-3" aria-hidden />
        {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => create.mutate(finding)}
      disabled={create.isPending || tasksQuery.isLoading}
      className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-hairline bg-surface-card px-2 py-1 text-xs font-medium text-ink transition-colors hover:bg-canvas-soft disabled:opacity-50"
    >
      <Plus className="h-3 w-3" aria-hidden />
      {create.isPending ? 'Adding…' : 'Add task'}
    </button>
  );
}
```

- [ ] **Step 4: Run the test, then commit**

Run: `pnpm test --run src/components/tasks/add-task-button.test.tsx`
Expected: PASS (5 tests).

```bash
git add src/components/tasks/
git commit -m "feat: add AddTaskButton with existing-task states"
```

---

### Task 8: `TasksPanel`

**Files:**
- Create: `src/components/tasks/tasks-panel.tsx`
- Create: `src/components/tasks/tasks-panel.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/components/tasks/tasks-panel.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TasksPanel } from './tasks-panel';

const updateMutate = vi.fn();
let tasksData: { tasks: unknown[] } | undefined;
let isLoading = false;

vi.mock('next/navigation', () => ({ usePathname: () => '/sites/uid-1' }));
vi.mock('@/hooks/use-site-tasks', () => ({
  useSiteTasks: () => ({ data: tasksData, isLoading }),
  useUpdateSiteTaskStatus: () => ({ mutate: updateMutate, isPending: false }),
}));
vi.mock('@/components/generations/page-workspace-context', () => ({
  usePageWorkspace: () => ({
    pages: [{ url: 'https://x.com/about', path: 'about', filename: 'about', status: 'ok' }],
  }),
}));

const task = (over: Record<string, unknown> = {}) => ({
  id: 't1', sourceType: 'citation-check', sourceId: 'schema-type',
  pageUrl: 'https://x.com/about', title: 'Schema.org type',
  foundText: 'Unrecognized @type(s): JobPosting',
  fixText: 'Declare a Schema.org @type appropriate for this page.',
  status: 'open', createdAt: '2026-06-09T00:00:00Z', statusChangedAt: '2026-06-09T00:00:00Z',
  ...over,
});

beforeEach(() => {
  updateMutate.mockClear();
  tasksData = { tasks: [] };
  isLoading = false;
});

describe('TasksPanel', () => {
  it('shows the empty state when there are no tasks', () => {
    render(<TasksPanel siteUid="s1" />);
    expect(screen.getByText(/no tasks yet/i)).toBeInTheDocument();
  });

  it('groups tasks by status', () => {
    tasksData = {
      tasks: [
        task(),
        task({ id: 't2', sourceId: 'h1-present', status: 'verified', title: 'H1 present' }),
        task({ id: 't3', sourceId: 'canonical', status: 'wont_do', title: 'Canonical tag' }),
      ],
    };
    render(<TasksPanel siteUid="s1" />);
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText("Won't do")).toBeInTheDocument();
    expect(screen.getByText('Verified by audit')).toBeInTheDocument();
  });

  it('marks an open task done via the checkbox', () => {
    tasksData = { tasks: [task()] };
    render(<TasksPanel siteUid="s1" />);
    fireEvent.click(screen.getByRole('button', { name: /mark done/i }));
    expect(updateMutate).toHaveBeenCalledWith({ taskId: 't1', status: 'done' });
  });

  it("flags an open task as won't do", () => {
    tasksData = { tasks: [task()] };
    render(<TasksPanel siteUid="s1" />);
    fireEvent.click(screen.getByRole('button', { name: /won't do/i }));
    expect(updateMutate).toHaveBeenCalledWith({ taskId: 't1', status: 'wont_do' });
  });

  it('reopens a non-open task', () => {
    tasksData = { tasks: [task({ status: 'wont_do' })] };
    render(<TasksPanel siteUid="s1" />);
    fireEvent.click(screen.getByRole('button', { name: /reopen/i }));
    expect(updateMutate).toHaveBeenCalledWith({ taskId: 't1', status: 'open' });
  });

  it('deep-links citation tasks to the readable tab for their page', () => {
    tasksData = { tasks: [task()] };
    render(<TasksPanel siteUid="s1" />);
    const link = screen.getByRole('link', { name: /view source/i });
    expect(link).toHaveAttribute('href', '/sites/uid-1?tab=readable&page=about');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test --run src/components/tasks/tasks-panel.test.tsx`
Expected: FAIL — cannot resolve `./tasks-panel`.

- [ ] **Step 3: Implement the component**

`src/components/tasks/tasks-panel.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Check, Ban, RotateCcw, ArrowUpRight, ClipboardList } from 'lucide-react';
import { useSiteTasks, useUpdateSiteTaskStatus } from '@/hooks/use-site-tasks';
import { usePageWorkspace } from '@/components/generations/page-workspace-context';
import type { SerializedSiteTask } from '@/lib/tasks/serialize';
import { cn } from '@/lib/utils';

export function TasksPanel({ siteUid }: { siteUid: string }) {
  const tasksQuery = useSiteTasks(siteUid);
  const tasks = tasksQuery.data?.tasks ?? [];

  if (tasksQuery.isLoading) {
    return <p className="px-2 py-6 text-sm text-muted-strong">Loading tasks…</p>;
  }

  if (tasks.length === 0) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
        <ClipboardList className="h-8 w-8 text-muted-soft" aria-hidden />
        <p className="mt-4 text-base text-muted-strong">
          No tasks yet — add one from any failing audit check.
        </p>
      </div>
    );
  }

  const open = tasks.filter((t) => t.status === 'open');
  const completed = tasks.filter((t) => t.status === 'done' || t.status === 'verified');
  const wontDo = tasks.filter((t) => t.status === 'wont_do');

  return (
    <div className="flex flex-col gap-8">
      <TaskGroup label="Open" tasks={open} siteUid={siteUid} emptyHint="Nothing open — nice." />
      {completed.length > 0 && <TaskGroup label="Completed" tasks={completed} siteUid={siteUid} />}
      {wontDo.length > 0 && <TaskGroup label="Won't do" tasks={wontDo} siteUid={siteUid} dimmed />}
    </div>
  );
}

function TaskGroup({
  label,
  tasks,
  siteUid,
  dimmed,
  emptyHint,
}: {
  label: string;
  tasks: SerializedSiteTask[];
  siteUid: string;
  dimmed?: boolean;
  emptyHint?: string;
}) {
  return (
    <section className={cn(dimmed && 'opacity-60')}>
      <h3 className="caption-uppercase mb-2 text-xs text-body">{label}</h3>
      {tasks.length === 0 ? (
        <p className="px-1 py-2 text-sm text-muted-strong">{emptyHint}</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} siteUid={siteUid} />
          ))}
        </ul>
      )}
    </section>
  );
}

function TaskRow({ task, siteUid }: { task: SerializedSiteTask; siteUid: string }) {
  const update = useUpdateSiteTaskStatus(siteUid);
  const pathname = usePathname();
  const { pages } = usePageWorkspace();

  const sourceHref = (() => {
    if (task.sourceType === 'citation-check') {
      const page = pages.find((p) => p.url === task.pageUrl);
      return page ? `${pathname}?tab=readable&page=${encodeURIComponent(page.path)}` : null;
    }
    if (task.sourceType === 'geo-signal') return `${pathname}?tab=recommendable`;
    if (task.sourceType === 'crawler-audit') return `${pathname}?tab=setup`;
    return null;
  })();

  const isOpen = task.status === 'open';
  const isChecked = task.status === 'done' || task.status === 'verified';

  return (
    <li className="flex gap-3 py-3">
      <button
        type="button"
        onClick={() => isOpen && update.mutate({ taskId: task.id, status: 'done' })}
        disabled={!isOpen || update.isPending}
        aria-label={isOpen ? 'Mark done' : task.status}
        className={cn(
          'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
          isChecked
            ? 'border-semantic-success bg-semantic-success/10 text-semantic-success'
            : 'border-hairline-strong bg-surface-card',
          isOpen && 'cursor-pointer hover:bg-canvas-soft',
        )}
      >
        {isChecked && <Check className="h-3.5 w-3.5" aria-hidden />}
        {task.status === 'wont_do' && <Ban className="h-3 w-3 text-muted-strong" aria-hidden />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className={cn('font-medium text-ink', !isOpen && 'line-through decoration-hairline-strong')}>
            {task.title}
          </p>
          {task.status === 'verified' && (
            <span className="whitespace-nowrap rounded-full border border-hairline bg-canvas-soft px-2 py-px text-[10px] font-semibold uppercase tracking-wide text-semantic-success">
              Verified by audit
            </span>
          )}
        </div>
        {task.pageUrl && (
          <p className="mt-0.5 truncate font-mono text-xs text-muted-strong" title={task.pageUrl}>
            {task.pageUrl}
          </p>
        )}
        {task.fixText && <p className="mt-1 text-sm text-body">{task.fixText}</p>}

        <div className="mt-2 flex items-center gap-3">
          {isOpen && (
            <button
              type="button"
              onClick={() => update.mutate({ taskId: task.id, status: 'wont_do' })}
              disabled={update.isPending}
              className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-strong transition-colors hover:text-ink"
            >
              <Ban className="h-3 w-3" aria-hidden /> Won&apos;t do
            </button>
          )}
          {!isOpen && (
            <button
              type="button"
              onClick={() => update.mutate({ taskId: task.id, status: 'open' })}
              disabled={update.isPending}
              className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-strong transition-colors hover:text-ink"
            >
              <RotateCcw className="h-3 w-3" aria-hidden /> Reopen
            </button>
          )}
          {sourceHref && (
            <Link
              href={sourceHref}
              className="inline-flex items-center gap-1 text-xs text-muted-strong transition-colors hover:text-ink"
            >
              <ArrowUpRight className="h-3 w-3" aria-hidden /> View source
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}
```

- [ ] **Step 4: Run the test, then commit**

Run: `pnpm test --run src/components/tasks/tasks-panel.test.tsx`
Expected: PASS (6 tests).

```bash
git add src/components/tasks/
git commit -m "feat: add TasksPanel with status groups and deep links"
```

---

### Task 9: Wire the Tasks tab + sidebar badge into the site detail page

**Files:**
- Modify: `src/app/(app)/sites/[id]/site-detail-client.tsx` (the PR #17 version)
- Create: `src/app/(app)/sites/[id]/site-detail-client.test.tsx`

- [ ] **Step 1: Add the tab**

In `site-detail-client.tsx`:

1. Extend the constants:

```ts
const VALID_TABS = ['overview', 'readable', 'recommendable', 'recognized', 'setup', 'tasks'] as const;
```

```ts
const tabItems: { value: TabValue; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'readable', label: 'Readable' },
  { value: 'recommendable', label: 'Recommendable' },
  { value: 'recognized', label: 'Recognized' },
  { value: 'setup', label: 'Setup' },
  { value: 'tasks', label: 'Tasks' },
];
```

2. Add imports:

```ts
import { TasksPanel } from '@/components/tasks/tasks-panel';
import { useSiteTasks } from '@/hooks/use-site-tasks';
```

3. Inside the component body (near the other hooks), read the open count:

```ts
const siteTasksQuery = useSiteTasks(site.uid);
const openTaskCount = siteTasksQuery.data?.tasks.filter((t) => t.status === 'open').length ?? 0;
```

4. In the content card, alongside the other `{activeTab === ...}` conditionals
   (inside `PageWorkspaceProvider` — `TasksPanel` uses `usePageWorkspace` for
   deep links):

```tsx
{activeTab === 'tasks' && <TasksPanel siteUid={site.uid} />}
```

5. In the sidebar portal's tab-button loop, after `{tab.label}` add the badge:

```tsx
{tab.value === 'tasks' && openTaskCount > 0 && (
  <span className="ml-auto rounded-full border border-hairline bg-surface-card px-1.5 py-px text-[10px] font-semibold text-muted-strong">
    {openTaskCount}
  </span>
)}
```

- [ ] **Step 2: Write the test**

`src/app/(app)/sites/[id]/site-detail-client.test.tsx` — a focused test of the
tab wiring with all panels and shell hooks mocked. Portals need real mounts, so
the shell-hook mocks return `document.body`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SiteDetailClient } from './site-detail-client';
import type { Site } from '@/db/schema';

const replace = vi.fn();
let search = new URLSearchParams('');
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh: vi.fn() }),
  usePathname: () => '/sites/uid-1',
  useSearchParams: () => search,
}));
vi.mock('@/components/layout/app-shell-rail', () => ({
  useAppShellRail: () => ({ mount: document.body, setActive: vi.fn() }),
}));
vi.mock('@/components/layout/app-shell-header', () => ({
  useAppShellHeader: () => ({ mount: document.body, setActive: vi.fn() }),
}));
vi.mock('@/components/layout/app-shell-sidebar-slot', () => ({
  useAppShellSidebarSlot: () => ({ mount: document.body, active: true, setActive: vi.fn() }),
}));
vi.mock('@/components/generations/overview-panel', () => ({ OverviewPanel: () => <div>overview-panel</div> }));
vi.mock('@/components/generations/readable-panel', () => ({ ReadablePanel: () => <div>readable-panel</div> }));
vi.mock('@/components/generations/recommendable-panel', () => ({ RecommendablePanel: () => <div>recommendable-panel</div> }));
vi.mock('@/components/generations/recognized-panel', () => ({ RecognizedPanel: () => <div>recognized-panel</div> }));
vi.mock('@/components/generations/setup-panel', () => ({ SetupPanel: () => <div>setup-panel</div> }));
vi.mock('@/components/generations/pages-rail', () => ({ PagesRail: () => <div>pages-rail</div> }));
vi.mock('@/components/tasks/tasks-panel', () => ({ TasksPanel: () => <div>tasks-panel</div> }));
vi.mock('@/components/sites/settings-dialog', () => ({ SettingsDialog: () => null }));
vi.mock('@/hooks/use-site-tasks', () => ({
  useSiteTasks: () => ({
    data: { tasks: [{ id: 't1', status: 'open' }, { id: 't2', status: 'done' }] },
    isLoading: false,
  }),
}));

const site = {
  id: 1, uid: 'uid-1', name: 'Example', displayName: 'Example', description: null,
  rootUrl: 'https://example.com', faviconUrl: null, userId: 1,
  webhookTokenHash: 'h'.repeat(64), webhookTokenPrefix: 'lmt_hhhh',
} as unknown as Site;

function renderClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SiteDetailClient site={site} generations={[]} />
    </QueryClientProvider>,
  );
}

describe('SiteDetailClient tasks tab', () => {
  it('lists Tasks in the sidebar nav with the open count badge', () => {
    renderClient();
    expect(screen.getByRole('button', { name: /tasks/i })).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument(); // 1 open of 2 tasks
  });

  it('renders the TasksPanel when ?tab=tasks', () => {
    search = new URLSearchParams('tab=tasks');
    renderClient();
    expect(screen.getByText('tasks-panel')).toBeInTheDocument();
    search = new URLSearchParams('');
  });
});
```

Adjust mocks if the component imports modules not listed here (run the test and
follow the resolver errors — every panel/dialog import needs a mock; do not
mock `page-workspace-context`, the real provider works with `generations={[]}`
when `fetch` is unstubbed because the manifest query is disabled with no
generation).

- [ ] **Step 3: Run the test to verify it passes**

Run: `pnpm test --run "src/app/(app)/sites/\[id\]/site-detail-client.test.tsx"`
Expected: PASS (2 tests).

- [ ] **Step 4: Full suite + commit**

Run: `pnpm test --run`
Expected: all pass.

```bash
git add "src/app/(app)/sites/[id]/"
git commit -m "feat: add Tasks tab with open-count badge to site detail"
```

---

### Task 10: Add-task button on citation checks

**Files:**
- Modify: `src/components/citations/citations-page-detail.tsx`
- Modify: `src/components/citations/citations-page-detail.test.tsx`

- [ ] **Step 1: Integrate the button**

In `citations-page-detail.tsx`, add the import:

```ts
import { AddTaskButton } from '@/components/tasks/add-task-button';
```

In the checks `AccordionContent` (currently renders `Found:` and `Fix:`
paragraphs), append after the `Fix:` paragraph, inside the same
`AccordionContent`:

```tsx
{!c.passed && (
  <div className="mt-2">
    <AddTaskButton
      siteUid={siteUid}
      finding={{
        sourceType: 'citation-check',
        sourceId: c.id,
        pageUrl,
        title: CHECK_LABEL[c.id] ?? c.id,
        foundText: c.evidence.join(' '),
        fixText: c.recommendation ?? '',
      }}
    />
  </div>
)}
```

- [ ] **Step 2: Update the test**

In `citations-page-detail.test.tsx`, add a module mock at the top alongside the
existing mocks:

```tsx
vi.mock('@/components/tasks/add-task-button', () => ({
  AddTaskButton: ({ finding }: { finding: { sourceId: string } }) => (
    <div data-testid={`add-task-${finding.sourceId}`} />
  ),
}));
```

Then add a test. The file's `successAudit` fixture has `h1-present`
(passed: true) and `answer-position` (passed: false):

```tsx
test('renders an add-task button for failing checks only', async () => {
  vi.stubGlobal('fetch', vi.fn(async () =>
    new Response(JSON.stringify({ audits: [successAudit] }), {
      status: 200, headers: { 'content-type': 'application/json' },
    }),
  ));
  render(withQueryClient(<CitationsPageDetail siteUid="site_1" pageUrl="https://x.com/a" onBack={() => {}} />));
  await waitFor(() => expect(screen.getByTestId('add-task-answer-position')).toBeInTheDocument());
  expect(screen.queryByTestId('add-task-h1-present')).toBeNull();
});
```

- [ ] **Step 3: Run the tests to verify they pass, then commit**

Run: `pnpm test --run src/components/citations/citations-page-detail.test.tsx`
Expected: PASS.

```bash
git add src/components/citations/
git commit -m "feat: add task creation from failing citation checks"
```

---

### Task 11: Add-task button on geo signals

**Files:**
- Modify: `src/components/generations/geo-signal-list.tsx`
- Modify: `src/components/generations/geo-signal-list.test.tsx`
- Modify: `src/components/generations/recommendable-panel.tsx` (line ~100: `<GeoSignalList signals={result.signals} />`)

- [ ] **Step 1: Integrate the button**

`geo-signal-list.tsx` — add the `siteUid` prop and render the button in the
absent-signal branch:

```tsx
import { AddTaskButton } from '@/components/tasks/add-task-button';

export function GeoSignalList({ signals, siteUid }: { signals: Signal[]; siteUid: string }) {
```

Replace the `{!s.present && s.recommendation && (...)}` block with:

```tsx
{!s.present && (
  <div className="mt-1.5 flex flex-col gap-2">
    {s.recommendation && (
      <p className="border-l-2 border-hairline-strong pl-3 text-sm text-body">{s.recommendation}</p>
    )}
    <div>
      <AddTaskButton
        siteUid={siteUid}
        finding={{
          sourceType: 'geo-signal',
          sourceId: s.signal,
          title: s.label,
          foundText: '',
          fixText: s.recommendation ?? '',
        }}
      />
    </div>
  </div>
)}
```

In `recommendable-panel.tsx`, update the call site (the panel already receives
`siteId`):

```tsx
<GeoSignalList signals={result.signals} siteUid={siteId} />
```

- [ ] **Step 2: Update the test**

In `geo-signal-list.test.tsx`: the existing `signals` fixture has `pricing`
(present: true) and `comparison` (present: false). Add the module mock at the
top:

```tsx
vi.mock('@/components/tasks/add-task-button', () => ({
  AddTaskButton: ({ finding }: { finding: { sourceId: string } }) => (
    <div data-testid={`add-task-${finding.sourceId}`} />
  ),
}));
```

(add `vi` to the vitest import), change the existing render to
`<GeoSignalList signals={signals} siteUid="s1" />`, and add:

```tsx
it('renders an add-task button only for absent signals', () => {
  render(<GeoSignalList signals={signals} siteUid="s1" />);
  expect(screen.getByTestId('add-task-comparison')).toBeInTheDocument();
  expect(screen.queryByTestId('add-task-pricing')).toBeNull();
});
```

- [ ] **Step 3: Run tests, then commit**

Run: `pnpm test --run src/components/generations/geo-signal-list.test.tsx src/components/generations/recommendable-panel.test.tsx`
Expected: PASS.

```bash
git add src/components/generations/
git commit -m "feat: add task creation from absent geo signals"
```

---

### Task 12: Add-task button on blocked crawler bots

**Files:**
- Modify: `src/components/crawlers/crawler-audit-table.tsx`
- Modify: `src/components/crawlers/crawler-audit-table.test.tsx`
- Modify: `src/components/crawlers/crawler-audit-tab.tsx` (pass `siteUid` through)

- [ ] **Step 1: Integrate the button**

`crawler-audit-table.tsx` — add a `siteUid` prop and an actions cell for
blocked bots:

```tsx
import { AddTaskButton } from '@/components/tasks/add-task-button';

export function CrawlerAuditTable({ rows, siteUid }: { rows: CrawlerAuditRow[]; siteUid: string }) {
```

In each row, after the status pill / reason cell, add a cell:

```tsx
<td className="px-4 py-3 text-right">
  {row.status === 'blocked' && (
    <AddTaskButton
      siteUid={siteUid}
      finding={{
        sourceType: 'crawler-audit',
        sourceId: row.bot,
        title: `Allow ${row.bot} in robots.txt`,
        foundText: row.reason ?? 'Blocked by robots.txt',
        fixText: `Update robots.txt to allow ${row.bot}.`,
      }}
    />
  )}
</td>
```

Read the table's existing `<thead>`/`<tbody>` structure first and add a
matching (label-less) header cell so columns stay aligned.

In `crawler-audit-tab.tsx`, the component receives `siteId` — pass it through
at the `<CrawlerAuditTable rows={...} />` call site:

```tsx
<CrawlerAuditTable rows={rows} siteUid={siteId} />
```

(Note: crawler-audit tasks have no reconciler in v1 — they complete manually.
This is by design; see the spec.)

- [ ] **Step 2: Update the tests**

In `crawler-audit-table.test.tsx`: add the same module mock as Tasks 10–11
(add `vi` to the vitest import), pass `siteUid="s1"` to every existing
`<CrawlerAuditTable />` render (there are five), and add:

```tsx
it('renders an add-task button only for blocked bots', () => {
  render(
    <CrawlerAuditTable
      siteUid="s1"
      rows={[
        { bot: 'GPTBot', status: 'allowed' },
        { bot: 'ClaudeBot', status: 'blocked', reason: 'Disallow: /' },
      ]}
    />,
  );
  expect(screen.getByTestId('add-task-ClaudeBot')).toBeInTheDocument();
  expect(screen.queryByTestId('add-task-GPTBot')).toBeNull();
});
```

`crawler-audit-tab.test.tsx` renders the table indirectly — add the same
module mock there and it will pass unchanged (the tab supplies `siteUid` via
its existing `siteId` prop).

- [ ] **Step 3: Run tests, then commit**

Run: `pnpm test --run src/components/crawlers/`
Expected: PASS.

```bash
git add src/components/crawlers/
git commit -m "feat: add task creation from blocked AI crawlers"
```

---

### Task 13: Full verification + PR

- [ ] **Step 1: Full suite and build**

Run: `pnpm test --run`
Expected: all pass.

Run: `pnpm build`
Expected: clean build, route listing includes `/api/sites/[id]/tasks` and
`/api/sites/[id]/tasks/[taskUid]`.

- [ ] **Step 2: Manual preview walkthrough**

With `pnpm dev` running, on a site with audit data:

1. Readable tab → open a failing check → click **Add task** → button flips to
   **Added**.
2. Sidebar shows **Tasks** with a count badge → open it → the task is listed
   under Open with its Fix text and a **View source** link back to the page.
3. Check it off → moves to Completed. Click **Won't do** on another → moves to
   the dimmed Won't do group. **Reopen** works from both.
4. Re-run the page's citation audit so the check passes → reload the Tasks tab
   → the task shows **Verified by audit**.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feat/audit-tasks
gh pr create --title "Audit tasks: per-site task list generated from failing audit findings" \
  --body "Implements docs/superpowers/specs/2026-06-09-audit-tasks-design.md ..."
```

If PR #17 is still open, set its branch as the base:
`gh pr create --base feat/site-detail-shell-restructure ...`
