# Generator Draft Persistence + Download + Warnings — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `RobotsGenerator` survive a page revisit. Auto-save toggle state per site, prepend the site's current `robots.txt` content (verbatim) to the snippet, add a "Download robots.txt" button next to "Copy snippet", and show a dismissible warning when the site has no `robots.txt` or when its `robots.txt` blocks all crawlers via a wildcard `Disallow: /`.

**Architecture:** New 1:1 table `robots_generator_drafts(siteId, toggles JSON, updatedAt)`. Two endpoints: `GET /api/sites/:id/generator-draft` (returns draft or 404) and `PUT /api/sites/:id/generator-draft` (upsert). The `RobotsGenerator` becomes the owner of the draft query+mutation; it accepts `siteId` and the latest audit, seeds toggles from the saved draft (falling back to audit-derived toggles), and debounces an upsert mutation on every toggle change. The snippet output prepends `audit.robotsContent` (verbatim) with a divider comment, then the existing generated block. Warning banner uses the existing `parseRobotsTxt` (client-safe) to detect a `User-agent: *` group with `Disallow: /`.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM (Turso/libSQL), Vitest + React Testing Library, TanStack Query, Tailwind v4 + ShadCN tokens.

---

## File Inventory

**New files:**
- `drizzle/<timestamp>_robots_generator_drafts.sql` — generated migration.
- `src/app/api/sites/[id]/generator-draft/route.ts` — `GET` + `PUT`.
- `src/app/api/sites/[id]/generator-draft/route.test.ts`.

**Modified files:**
- `src/db/schema.ts` — append `robotsGeneratorDrafts` table + types.
- `src/components/crawlers/robots-generator.tsx` — accept `siteId` + `robotsContent`; fetch + persist draft; render warning banner; add Download button; merge robotsContent into snippet.
- `src/components/crawlers/robots-generator.test.tsx` — extend tests for new props, persistence calls, download, warnings.
- `src/components/crawlers/crawler-audit-tab.tsx` — pass `siteId` and `audit.robotsContent` to `RobotsGenerator`.
- `src/components/crawlers/crawler-audit-tab.test.tsx` — adjust if signature change breaks any assertion.

---

## Task 1: DB schema + migration

**Files:** `src/db/schema.ts`, generated `drizzle/<timestamp>_*.sql`.

- [ ] **Step 1: Append to `src/db/schema.ts`** after `crawlerAudits`:

```ts
export const robotsGeneratorDrafts = sqliteTable(
  'robots_generator_drafts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    siteId: integer('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    toggles: text('toggles').notNull(),
    updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`),
  },
  (t) => ({
    uniqueSite: unique('robots_generator_drafts_site_unique').on(t.siteId),
  }),
);

export type RobotsGeneratorDraft = typeof robotsGeneratorDrafts.$inferSelect;
export type NewRobotsGeneratorDraft = typeof robotsGeneratorDrafts.$inferInsert;
```

- [ ] **Step 2:** `pnpm db:generate` — expect a new `drizzle/*.sql` containing `CREATE TABLE robots_generator_drafts (...)` plus a unique index on `site_id`.

- [ ] **Step 3:** `pnpm db:migrate` — applies to `local.db`.

- [ ] **Step 4:** Commit:
```bash
git add src/db/schema.ts drizzle/
git commit -m "feat(db): add robots_generator_drafts table"
```

---

## Task 2: API endpoint failing tests

**Files:** Create `src/app/api/sites/[id]/generator-draft/route.test.ts`.

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users, robotsGeneratorDrafts } from '@/db/schema';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));

import { GET, PUT } from './route';
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

const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });

function putRequest(body: unknown) {
  return new Request('http://t', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('GET /api/sites/[id]/generator-draft', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  it('returns 200 with the draft when it exists', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    await getDb()
      .insert(robotsGeneratorDrafts)
      .values({ siteId: site.id, toggles: '{"GPTBot":"block"}' });

    const res = await GET(new Request('http://t'), ctx(site.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.draft.toggles).toBe('{"GPTBot":"block"}');
  });

  it('returns 404 when no draft exists', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    const res = await GET(new Request('http://t'), ctx(site.id));
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-owner', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    const { user: other } = await makeUserAndSite('b@b.test');
    vi.mocked(getCurrentUser).mockResolvedValue(other);
    const res = await GET(new Request('http://t'), ctx(site.id));
    expect(res.status).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(new Request('http://t'), ctx(site.id));
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/sites/[id]/generator-draft', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  it('creates a draft when none exists', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const res = await PUT(
      putRequest({ toggles: { GPTBot: 'block', ClaudeBot: 'allow' } }),
      ctx(site.id),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(JSON.parse(body.draft.toggles).GPTBot).toBe('block');
  });

  it('updates an existing draft (upsert)', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    await getDb()
      .insert(robotsGeneratorDrafts)
      .values({ siteId: site.id, toggles: '{"GPTBot":"block"}' });

    const res = await PUT(
      putRequest({ toggles: { GPTBot: 'allow' } }),
      ctx(site.id),
    );
    expect(res.status).toBe(200);
    const rows = await getDb().select().from(robotsGeneratorDrafts);
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].toggles).GPTBot).toBe('allow');
  });

  it('returns 400 for invalid body', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const res = await PUT(
      putRequest({ toggles: 'not-an-object' }),
      ctx(site.id),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 for a non-owner', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    const { user: other } = await makeUserAndSite('b@b.test');
    vi.mocked(getCurrentUser).mockResolvedValue(other);
    const res = await PUT(putRequest({ toggles: {} }), ctx(site.id));
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2:** Run `pnpm test src/app/api/sites/[id]/generator-draft/route.test.ts` — confirm module-not-found failure. Do NOT commit.

---

## Task 3: API endpoint implementation

**Files:** Create `src/app/api/sites/[id]/generator-draft/route.ts`.

- [ ] **Step 1: Write the route**

```ts
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { robotsGeneratorDrafts } from '@/db/schema';
import {
  apiErrorResponse,
  ApiError,
  assertOwnsSite,
  requireUserOrThrow,
} from '@/lib/auth-guards';

type Ctx = { params: Promise<{ id: string }> };

async function parseSiteId(ctx: Ctx): Promise<number> {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(404, 'not_found', 'Site not found');
  return n;
}

const putBodySchema = z.object({
  toggles: z.record(z.string(), z.enum(['allow', 'block', 'default'])),
});

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const id = await parseSiteId(ctx);
    await assertOwnsSite(id, user.id);

    const [draft] = await getDb()
      .select()
      .from(robotsGeneratorDrafts)
      .where(eq(robotsGeneratorDrafts.siteId, id))
      .limit(1);

    if (!draft) throw new ApiError(404, 'not_found', 'No draft yet');
    return Response.json({ draft });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const id = await parseSiteId(ctx);
    await assertOwnsSite(id, user.id);
    const body = putBodySchema.parse(await req.json());

    const db = getDb();
    const togglesJson = JSON.stringify(body.toggles);
    const now = new Date().toISOString();

    const [draft] = await db
      .insert(robotsGeneratorDrafts)
      .values({ siteId: id, toggles: togglesJson, updatedAt: now })
      .onConflictDoUpdate({
        target: robotsGeneratorDrafts.siteId,
        set: { toggles: togglesJson, updatedAt: now },
      })
      .returning();

    return Response.json({ draft });
  } catch (err) {
    if (err instanceof Error && err.name === 'ZodError') {
      return apiErrorResponse(new ApiError(400, 'validation', err.message));
    }
    return apiErrorResponse(err);
  }
}
```

- [ ] **Step 2:** Run `pnpm test src/app/api/sites/[id]/generator-draft/route.test.ts` — 7/7 pass.

- [ ] **Step 3:** Commit:
```bash
git add src/app/api/sites/[id]/generator-draft/route.ts src/app/api/sites/[id]/generator-draft/route.test.ts
git commit -m "feat(api): add GET + PUT /api/sites/[id]/generator-draft"
```

---

## Task 4: RobotsGenerator — add persistence + download + new props

**Files:**
- Modify: `src/components/crawlers/robots-generator.tsx`
- Modify: `src/components/crawlers/robots-generator.test.tsx`

The component gains three new props: `siteId: number`, `robotsContent: string | null`. The `initial` prop stays for the audit-derived seed fallback.

The new `RobotsGenerator` should:
1. Use `useQuery` to fetch `/api/sites/:siteId/generator-draft` (returns 404 → null draft).
2. Seed toggles from the draft if present, else from `initial` (existing seed logic).
3. Use `useMutation` to PUT the draft on toggle change, debounced 400ms (no react-query debounce built-in — wrap with a `setTimeout` ref that fires the mutation).
4. Build the snippet as: `robotsContent` (if non-null) + divider + existing generated block.
5. "Copy snippet" / "Download robots.txt" buttons next to each other; download triggers a Blob download named `robots.txt`.
6. Show a small "Saved" pill (from `formatRelativeTime` on `lastSavedAt`) next to the section header when the mutation has fired.

Concrete implementation steps inline below — see the prepared component diff in `docs/superpowers/notes/2026-05-13-generator-component.md` (write that file or embed inline; agent will produce a final draft).

- [ ] **Step 1: Update tests first** — Extend `robots-generator.test.tsx`:
  - Update every existing call to `<RobotsGenerator initial={...} />` to also pass `siteId={1}` and `robotsContent={null}`.
  - Mock `fetch` for the draft endpoint (`/api/sites/1/generator-draft`) returning 404 by default so existing tests still pass with no draft.
  - Add new tests:
    - `loads saved toggles from the draft endpoint` — mock GET to return `{ draft: { toggles: '{"GPTBot":"block"}' } }`, render, assert the GPTBot block button is `aria-pressed=true`.
    - `debounces a PUT to save toggles on click` — mock GET 404, mock PUT 200, click Allow on GPTBot, wait, assert PUT was called with `toggles.GPTBot === 'allow'`.
    - `includes robotsContent verbatim in the snippet when present` — pass `robotsContent="User-agent: ExistingBot\nDisallow: /\n"`, click Block on GPTBot, assert snippet contains both `User-agent: ExistingBot` and `User-agent: GPTBot`.
    - `Download button triggers a download with filename robots.txt` — mock `URL.createObjectURL` and an `<a>` click; assert the download attribute is `'robots.txt'` and `createObjectURL` was called.

Wrap test setup with `withQueryClient` from `@/test/utils` (already used by `crawler-audit-tab.test.tsx`).

- [ ] **Step 2: Update the component implementation** to match the above behavior.

  Key changes inside `RobotsGenerator`:

  ```tsx
  export function RobotsGenerator({
    siteId,
    initial,
    robotsContent,
  }: {
    siteId: number;
    initial: AuditResults;
    robotsContent: string | null;
  }) {
    const qc = useQueryClient();
    const draftKey = ['sites', siteId, 'generator-draft'] as const;

    const draft = useQuery({
      queryKey: draftKey,
      queryFn: async () => {
        const res = await fetch(`/api/sites/${siteId}/generator-draft`);
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as { draft: { toggles: string } };
      },
    });

    const seeded = useMemo(() => seedToggles(initial), [initial]);
    const [toggles, setToggles] = useState<Record<KnownAiBot, ToggleState>>(seeded);
    const hydrated = useRef(false);

    // Hydrate from the draft once it arrives; otherwise leave at audit seed.
    useEffect(() => {
      if (hydrated.current) return;
      if (draft.isLoading) return;
      hydrated.current = true;
      if (draft.data) {
        try {
          const parsed = JSON.parse(draft.data.draft.toggles) as Record<string, ToggleState>;
          setToggles((prev) => {
            const next = { ...prev };
            for (const bot of KNOWN_AI_BOTS) {
              const v = parsed[bot];
              if (v === 'allow' || v === 'block' || v === 'default') next[bot] = v;
            }
            return next;
          });
        } catch {
          // ignore corrupt draft
        }
      }
    }, [draft.data, draft.isLoading]);

    const save = useMutation({
      mutationFn: async (next: Record<KnownAiBot, ToggleState>) => {
        const res = await fetch(`/api/sites/${siteId}/generator-draft`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ toggles: next }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      },
      onSuccess: () => qc.invalidateQueries({ queryKey: draftKey }),
    });

    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    function scheduleSave(next: Record<KnownAiBot, ToggleState>) {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => save.mutate(next), 400);
    }

    function set(bot: KnownAiBot, nextValue: 'allow' | 'block'): void {
      setToggles((prev) => {
        const updated = { ...prev, [bot]: prev[bot] === nextValue ? 'default' : nextValue } as Record<KnownAiBot, ToggleState>;
        scheduleSave(updated);
        return updated;
      });
    }

    function reset(): void {
      const fresh = seedToggles(initial);
      setToggles(fresh);
      scheduleSave(fresh);
    }

    const generatedBlock = useMemo(
      () => buildSnippet(toggles, new Date().toISOString().slice(0, 10)),
      [toggles],
    );

    const snippet = useMemo(() => {
      if (!robotsContent) return generatedBlock;
      const trimmed = robotsContent.replace(/\s+$/, '');
      return `${trimmed}\n\n# === AI Ready generated additions ===\n${generatedBlock}`;
    }, [robotsContent, generatedBlock]);

    const empty = useMemo(() => KNOWN_AI_BOTS.every((b) => toggles[b] === 'default'), [toggles]);

    function download() {
      const blob = new Blob([snippet], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'robots.txt';
      a.click();
      URL.revokeObjectURL(url);
    }

    // ...existing JSX, with Reset wired to reset(),
    // an extra Button "Download robots.txt" next to "Copy snippet",
    // and `set(bot, 'allow' | 'block')` unchanged in the toggle row handlers.
  }
  ```

- [ ] **Step 3:** Run `pnpm test src/components/crawlers/robots-generator.test.tsx` — confirm all tests (existing + new) pass.

- [ ] **Step 4:** Commit:
```bash
git add src/components/crawlers/robots-generator.tsx src/components/crawlers/robots-generator.test.tsx
git commit -m "feat(ui): persist generator toggles per site + include existing robots.txt + download"
```

---

## Task 5: Wire new props in `CrawlerAuditTab`

**Files:** Modify `src/components/crawlers/crawler-audit-tab.tsx` (and update its test as needed).

- [ ] **Step 1:** Update the call site to pass `siteId` and `robotsContent`:

```tsx
<RobotsGenerator
  siteId={siteId}
  initial={results}
  robotsContent={audit?.robotsContent ?? null}
/>
```

Note: when the tab is in the empty/no-audit state, `RobotsGenerator` is not rendered at all (the empty state renders a "Run audit now" card and bails). The failed-audit state DOES render `RobotsGenerator` seeded with `emptyResults()`; in that state `audit.robotsContent` is null → snippet has no prefix. Pass `robotsContent={null}` there.

- [ ] **Step 2:** Run `pnpm test src/components/crawlers/crawler-audit-tab.test.tsx` — confirm still 4/4 pass. If a test fails because it now needs to mock the draft endpoint, add it in the existing `mockFetch` impls (return 404 for `/generator-draft`).

- [ ] **Step 3:** Commit:
```bash
git add src/components/crawlers/crawler-audit-tab.tsx src/components/crawlers/crawler-audit-tab.test.tsx
git commit -m "feat(ui): pass siteId + robotsContent to RobotsGenerator"
```

---

## Task 6: Warning banner for missing or restrictive robots.txt

**Files:** Modify `src/components/crawlers/robots-generator.tsx` and its test.

- [ ] **Step 1:** Add a small helper at the top of `robots-generator.tsx`:

```ts
import { parseRobotsTxt } from '@/lib/robots-parser';

function wildcardBlocksRoot(content: string): boolean {
  const groups = parseRobotsTxt(content);
  for (const g of groups) {
    if (!g.userAgents.some((ua) => ua.trim() === '*')) continue;
    const disallowsRoot = g.rules.some(
      (r) => r.type === 'disallow' && (r.path === '/' || r.path === '/*'),
    );
    if (disallowsRoot) return true;
  }
  return false;
}
```

- [ ] **Step 2:** Add a dismissible banner state inside the component:

```tsx
type WarningKind = 'no-robots' | 'wildcard-block' | null;

const warning: WarningKind = useMemo(() => {
  if (robotsContent === null) return 'no-robots';
  if (wildcardBlocksRoot(robotsContent)) return 'wildcard-block';
  return null;
}, [robotsContent]);

const [dismissed, setDismissed] = useState(false);
```

Render the banner above the two-column grid (toggles + snippet) when `warning && !dismissed`:

```tsx
{warning && !dismissed && (
  <div
    role="alert"
    className="flex items-start justify-between gap-3 rounded-xl border border-timeline-thinking/60 bg-timeline-thinking/15 p-4"
  >
    <div className="space-y-1">
      <div className="caption-uppercase text-[#7a4229]">Heads up</div>
      <p className="text-sm text-ink">
        {warning === 'no-robots'
          ? `This site has no robots.txt. The directives below will be your starting point.`
          : `Your robots.txt blocks all crawlers via User-agent: * Disallow: /. Even bots set to ALLOW below may skip your site if they don't have an explicit allow rule.`}
      </p>
    </div>
    <button
      type="button"
      onClick={() => setDismissed(true)}
      className="caption-uppercase text-muted-strong hover:text-ink"
      aria-label="Dismiss warning"
    >
      Dismiss
    </button>
  </div>
)}
```

- [ ] **Step 3:** Add tests in `robots-generator.test.tsx`:

```tsx
  it('shows the no-robots warning when robotsContent is null', () => {
    renderGen({ robotsContent: null });
    expect(screen.getByRole('alert')).toHaveTextContent(/no robots\.txt/i);
  });

  it('shows the wildcard-block warning when User-agent: * Disallow: / is set', () => {
    renderGen({
      robotsContent: 'User-agent: *\nDisallow: /\n',
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/blocks all crawlers/i);
  });

  it('does not show a warning when robotsContent is permissive', () => {
    renderGen({ robotsContent: 'User-agent: *\nAllow: /\n' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Dismiss button hides the warning', async () => {
    const user = userEvent.setup();
    renderGen({ robotsContent: null });
    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByRole('alert')).toBeNull();
  });
```

Helper `renderGen` to centralize rendering with `withQueryClient` + default mocks:

```tsx
function renderGen(props: Partial<{ robotsContent: string | null; initial: AuditResults }> = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('', { status: 404 }))),
  );
  return render(
    withQueryClient(
      <RobotsGenerator
        siteId={1}
        initial={props.initial ?? defaultResults()}
        robotsContent={props.robotsContent ?? null}
      />,
    ),
  );
}
```

- [ ] **Step 4:** Run `pnpm test src/components/crawlers/robots-generator.test.tsx` — confirm green.

- [ ] **Step 5:** Commit:
```bash
git add src/components/crawlers/robots-generator.tsx src/components/crawlers/robots-generator.test.tsx
git commit -m "feat(ui): warn when site has no robots.txt or wildcard blocks all crawlers"
```

---

## Task 7: Final verification

- [ ] **Step 1:** `pnpm test` — full suite green.
- [ ] **Step 2:** `pnpm lint` — 0 new errors.
- [ ] **Step 3:** `pnpm build` — succeeds, both new endpoint routes registered.

---

## Self-Review

**Spec coverage:**
- Auto-save: Tasks 1–5 build the storage, endpoints, hydration, debounced PUT.
- Verbatim robots.txt in snippet: Task 4 (snippet builder) + Task 5 (prop wiring).
- Download button: Task 4 (Blob + URL.createObjectURL).
- Warnings (no robots.txt or wildcard block): Task 6.

**Placeholder scan:** No TODOs, no "implement later". Every code block is concrete.

**Type consistency:** `ToggleState`, `KNOWN_AI_BOTS`, `AuditResults`, `RobotsGeneratorDraft` all defined and used consistently. Endpoint return shapes match TanStack Query expectations.
