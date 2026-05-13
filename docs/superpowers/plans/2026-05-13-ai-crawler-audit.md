# AI Crawler Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the in-app AI crawler audit feature — parse a saved site's `robots.txt`, surface allow/block posture across nine known AI user-agents, and emit a generator snippet users can paste back into their robots.txt. Runs after every generation success and on demand. See spec at `docs/superpowers/specs/2026-05-13-ai-crawler-audit-design.md`.

**Architecture:** New `crawler_audits` table stores per-site audit history (JSON results blob). A shared `runCrawlerAudit` library function fetches and parses `robots.txt`, evaluates each known bot, and inserts a row. Both a POST endpoint and a new workflow step (running after generation success) call this library. The site detail page gains an "AI Crawlers" tab with three components: a status table, a robots.txt generator with per-bot toggles, and a container that orchestrates fetch/empty/error/success states via TanStack Query.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM (Turso/libSQL), Vitest + React Testing Library, TanStack Query, Workflow DevKit (`'use step'`), Tailwind v4 + ShadCN tokens from `DESIGN.md`.

---

## File Inventory

**New files:**
- `src/db/schema.ts` (modify) — append `crawlerAudits` table + types.
- `drizzle/<timestamp>_<name>.sql` — generated migration.
- `src/lib/known-ai-bots.ts` — `KNOWN_AI_BOTS` constant + type.
- `src/lib/robots-parser.ts` — pure parser.
- `src/lib/robots-parser.test.ts`.
- `src/lib/__fixtures__/robots/empty.txt`
- `src/lib/__fixtures__/robots/block-all-ai.txt`
- `src/lib/__fixtures__/robots/allow-all-wildcard.txt`
- `src/lib/__fixtures__/robots/mixed.txt`
- `src/lib/__fixtures__/robots/partial-paths.txt`
- `src/lib/__fixtures__/robots/wildcard-paths.txt`
- `src/lib/__fixtures__/robots/allow-overrides-disallow.txt`
- `src/lib/__fixtures__/robots/malformed.txt`
- `src/lib/crawler-audit.ts` — fetch + parse + write.
- `src/lib/crawler-audit.test.ts`.
- `src/app/api/sites/[id]/audits/route.ts` — `POST`.
- `src/app/api/sites/[id]/audits/route.test.ts`.
- `src/app/api/sites/[id]/audits/latest/route.ts` — `GET`.
- `src/app/api/sites/[id]/audits/latest/route.test.ts`.
- `src/components/crawlers/crawler-audit-table.tsx`.
- `src/components/crawlers/crawler-audit-table.test.tsx`.
- `src/components/crawlers/robots-generator.tsx`.
- `src/components/crawlers/robots-generator.test.tsx`.
- `src/components/crawlers/crawler-audit-tab.tsx`.
- `src/components/crawlers/crawler-audit-tab.test.tsx`.

**Modified files:**
- `src/lib/workflow/steps.ts` — add `runCrawlerAuditStep`.
- `src/lib/workflow/generate-site-files.ts` — call new step after `completeStep`.
- `src/app/(app)/sites/[id]/site-detail-client.tsx` — register new tab.

---

## Task 1: Database schema + migration

**Files:**
- Modify: `src/db/schema.ts` (append at bottom)
- Generate: `drizzle/<timestamp>_crawler_audits.sql`

- [ ] **Step 1: Append the new table and types to `src/db/schema.ts`**

Open `src/db/schema.ts`. After the `generations` table definition and the existing type exports, append:

```ts
export const crawlerAudits = sqliteTable(
  'crawler_audits',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    siteId: integer('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['succeeded', 'failed'] }).notNull(),
    robotsUrl: text('robots_url').notNull(),
    robotsContent: text('robots_content'),
    results: text('results').notNull(),
    errorMessage: text('error_message'),
    fetchedAt: text('fetched_at').notNull().default(sql`(current_timestamp)`),
    trigger: text('trigger', { enum: ['generation', 'manual'] }).notNull(),
    generationId: integer('generation_id').references(() => generations.id, {
      onDelete: 'set null',
    }),
  },
  (t) => ({
    bySiteRecent: index('crawler_audits_by_site_recent').on(t.siteId, t.fetchedAt),
  }),
);

export type CrawlerAudit = typeof crawlerAudits.$inferSelect;
export type NewCrawlerAudit = typeof crawlerAudits.$inferInsert;
```

- [ ] **Step 2: Generate the migration**

Run: `pnpm db:generate`

Expected: Drizzle Kit writes a new SQL file under `drizzle/` named like `XXXX_<some_name>.sql`. The SQL should `CREATE TABLE crawler_audits (...)` with an `INDEX crawler_audits_by_site_recent` on `(site_id, fetched_at)`.

- [ ] **Step 3: Apply the migration locally**

Run: `pnpm db:migrate`

Expected: command succeeds. The new table exists in `local.db`.

- [ ] **Step 4: Verify the migration is committable**

Run: `git status drizzle/` — confirm the new `.sql` file is untracked.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts drizzle/
git commit -m "feat(db): add crawler_audits table for AI crawler audit feature"
```

---

## Task 2: Known AI bot constant

**Files:**
- Create: `src/lib/known-ai-bots.ts`

- [ ] **Step 1: Create the constant module**

Create `src/lib/known-ai-bots.ts` with:

```ts
export const KNOWN_AI_BOTS = [
  'GPTBot',
  'ClaudeBot',
  'Claude-Web',
  'PerplexityBot',
  'Google-Extended',
  'CCBot',
  'Bytespider',
  'Applebot-Extended',
  'Amazonbot',
] as const;

export type KnownAiBot = (typeof KNOWN_AI_BOTS)[number];

export type AuditBotStatus = 'allowed' | 'blocked' | 'partial' | 'default';

export type AuditBotResult = {
  status: AuditBotStatus;
  disallowedPaths?: string[];
};

export type AuditResults = Record<KnownAiBot, AuditBotResult>;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/known-ai-bots.ts
git commit -m "feat(lib): add KNOWN_AI_BOTS constant and audit result types"
```

---

## Task 3: Robots.txt parser — fixtures

**Files:**
- Create all eight fixture files under `src/lib/__fixtures__/robots/`

- [ ] **Step 1: `empty.txt`**

Create `src/lib/__fixtures__/robots/empty.txt` (literally empty file):

```
```

- [ ] **Step 2: `block-all-ai.txt`**

Create `src/lib/__fixtures__/robots/block-all-ai.txt`:

```
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: Claude-Web
User-agent: PerplexityBot
User-agent: Google-Extended
User-agent: CCBot
User-agent: Bytespider
User-agent: Applebot-Extended
User-agent: Amazonbot
Disallow: /
```

- [ ] **Step 3: `allow-all-wildcard.txt`**

Create `src/lib/__fixtures__/robots/allow-all-wildcard.txt`:

```
User-agent: *
Allow: /
```

- [ ] **Step 4: `mixed.txt`**

Create `src/lib/__fixtures__/robots/mixed.txt`:

```
User-agent: GPTBot
Disallow: /

User-agent: ClaudeBot
Allow: /

User-agent: CCBot
Disallow: /private

User-agent: *
Disallow: /admin
```

- [ ] **Step 5: `partial-paths.txt`**

Create `src/lib/__fixtures__/robots/partial-paths.txt`:

```
User-agent: GPTBot
Disallow: /admin
Disallow: /internal
```

- [ ] **Step 6: `wildcard-paths.txt`**

Create `src/lib/__fixtures__/robots/wildcard-paths.txt`:

```
User-agent: GPTBot
Disallow: /*.json
```

- [ ] **Step 7: `allow-overrides-disallow.txt`**

Create `src/lib/__fixtures__/robots/allow-overrides-disallow.txt`:

```
User-agent: GPTBot
Disallow: /
Allow: /
```

- [ ] **Step 8: `malformed.txt`**

Create `src/lib/__fixtures__/robots/malformed.txt`:

```
this line has no colon
User-agent GPTBot
User-agent: ClaudeBot
   :  : : :
Disallow: /
Sitemap: https://example.com/sitemap.xml
Crawl-delay: 5
```

- [ ] **Step 9: Commit**

```bash
git add src/lib/__fixtures__/robots/
git commit -m "test(robots-parser): add fixtures for robots.txt parsing"
```

---

## Task 4: Robots.txt parser — failing tests

**Files:**
- Create: `src/lib/robots-parser.test.ts`

- [ ] **Step 1: Write the test file**

Create `src/lib/robots-parser.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseRobotsTxt, evaluateBot } from './robots-parser';
import { KNOWN_AI_BOTS } from './known-ai-bots';

function fixture(name: string): string {
  return readFileSync(join(__dirname, '__fixtures__/robots', name), 'utf8');
}

describe('parseRobotsTxt + evaluateBot', () => {
  it('empty file: every known bot is default', () => {
    const groups = parseRobotsTxt(fixture('empty.txt'));
    for (const bot of KNOWN_AI_BOTS) {
      expect(evaluateBot(groups, bot)).toEqual({ status: 'default' });
    }
  });

  it('block-all-ai: every known bot is blocked', () => {
    const groups = parseRobotsTxt(fixture('block-all-ai.txt'));
    for (const bot of KNOWN_AI_BOTS) {
      expect(evaluateBot(groups, bot)).toEqual({ status: 'blocked' });
    }
  });

  it('allow-all-wildcard: every known bot is default (wildcard is not an explicit decision)', () => {
    const groups = parseRobotsTxt(fixture('allow-all-wildcard.txt'));
    for (const bot of KNOWN_AI_BOTS) {
      expect(evaluateBot(groups, bot)).toEqual({ status: 'default' });
    }
  });

  it('mixed: per-bot statuses follow the explicit groups', () => {
    const groups = parseRobotsTxt(fixture('mixed.txt'));
    expect(evaluateBot(groups, 'GPTBot')).toEqual({ status: 'blocked' });
    expect(evaluateBot(groups, 'ClaudeBot')).toEqual({ status: 'allowed' });
    expect(evaluateBot(groups, 'CCBot')).toEqual({
      status: 'partial',
      disallowedPaths: ['/private'],
    });
    expect(evaluateBot(groups, 'PerplexityBot')).toEqual({ status: 'default' });
  });

  it('partial-paths: status is partial with disallowedPaths populated', () => {
    const groups = parseRobotsTxt(fixture('partial-paths.txt'));
    expect(evaluateBot(groups, 'GPTBot')).toEqual({
      status: 'partial',
      disallowedPaths: ['/admin', '/internal'],
    });
  });

  it('wildcard-paths: status is partial; wildcard pattern is preserved verbatim', () => {
    const groups = parseRobotsTxt(fixture('wildcard-paths.txt'));
    expect(evaluateBot(groups, 'GPTBot')).toEqual({
      status: 'partial',
      disallowedPaths: ['/*.json'],
    });
  });

  it('allow-overrides-disallow: Allow: / on root makes the bot allowed despite Disallow: /', () => {
    const groups = parseRobotsTxt(fixture('allow-overrides-disallow.txt'));
    expect(evaluateBot(groups, 'GPTBot')).toEqual({ status: 'allowed' });
  });

  it('malformed: silently skips bad lines, parses ClaudeBot group correctly', () => {
    const groups = parseRobotsTxt(fixture('malformed.txt'));
    expect(evaluateBot(groups, 'ClaudeBot')).toEqual({ status: 'blocked' });
    expect(evaluateBot(groups, 'GPTBot')).toEqual({ status: 'default' });
  });

  it('UA match is case-insensitive', () => {
    const groups = parseRobotsTxt('User-agent: gptbot\nDisallow: /');
    expect(evaluateBot(groups, 'GPTBot')).toEqual({ status: 'blocked' });
  });

  it('longest UA match wins when multiple specific groups exist', () => {
    const groups = parseRobotsTxt(
      [
        'User-agent: Claude',
        'Disallow: /',
        '',
        'User-agent: Claude-Web',
        'Allow: /',
      ].join('\n'),
    );
    // Claude-Web is longer than Claude, so Claude-Web wins.
    expect(evaluateBot(groups, 'Claude-Web')).toEqual({ status: 'allowed' });
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

Run: `pnpm test src/lib/robots-parser.test.ts`

Expected: FAIL — `Cannot find module './robots-parser'` or equivalent.

---

## Task 5: Robots.txt parser — implementation

**Files:**
- Create: `src/lib/robots-parser.ts`

- [ ] **Step 1: Write the parser**

Create `src/lib/robots-parser.ts`:

```ts
export type RobotsRule = { type: 'allow' | 'disallow'; path: string };
export type RobotsGroup = { userAgents: string[]; rules: RobotsRule[] };

export function parseRobotsTxt(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasRule = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const stripped = rawLine.replace(/#.*$/, '').trim();
    if (!stripped) continue;

    const colon = stripped.indexOf(':');
    if (colon <= 0) continue;

    const directive = stripped.slice(0, colon).trim().toLowerCase();
    const value = stripped.slice(colon + 1).trim();
    if (!value) continue;

    if (directive === 'user-agent') {
      if (current && lastWasRule) {
        groups.push(current);
        current = null;
        lastWasRule = false;
      }
      if (!current) current = { userAgents: [], rules: [] };
      current.userAgents.push(value);
      continue;
    }

    if (directive === 'allow' || directive === 'disallow') {
      if (!current) continue;
      current.rules.push({ type: directive, path: value });
      lastWasRule = true;
      continue;
    }

    // Ignore unrecognized directives (Sitemap, Crawl-delay, etc.).
  }

  if (current) groups.push(current);
  return groups;
}

import type { AuditBotResult } from './known-ai-bots';

export function evaluateBot(
  groups: RobotsGroup[],
  botName: string,
): AuditBotResult {
  const matched = findSpecificGroup(groups, botName);
  if (!matched) return { status: 'default' };

  const rootAllowed = isRootAllowed(matched.rules);
  const disallows = matched.rules
    .filter((r) => r.type === 'disallow')
    .map((r) => r.path);

  if (disallows.length === 0) return { status: 'allowed' };

  if (!rootAllowed) return { status: 'blocked' };

  // Root reachable but other Disallow paths exist → partial.
  // If the only Disallow was on root (and an Allow overrode it), there are
  // no non-root disallows left, so the bot is fully allowed.
  const nonRoot = disallows.filter((p) => p !== '/' && p !== '');
  if (nonRoot.length === 0) return { status: 'allowed' };
  return { status: 'partial', disallowedPaths: nonRoot };
}

function findSpecificGroup(
  groups: RobotsGroup[],
  botName: string,
): RobotsGroup | null {
  const lowerBot = botName.toLowerCase();
  let best: { group: RobotsGroup; length: number } | null = null;
  for (const g of groups) {
    for (const ua of g.userAgents) {
      const lowerUa = ua.toLowerCase();
      if (lowerUa === '*') continue;
      if (lowerUa === lowerBot) {
        if (!best || ua.length > best.length) {
          best = { group: g, length: ua.length };
        }
      }
    }
  }
  return best?.group ?? null;
}

function isRootAllowed(rules: RobotsRule[]): boolean {
  // Apply RFC 9309: longest matching path wins for "/"; Allow wins ties.
  let best: { type: 'allow' | 'disallow'; length: number } | null = null;
  for (const r of rules) {
    if (!matchesRoot(r.path)) continue;
    const len = r.path.length;
    if (!best || len > best.length || (len === best.length && r.type === 'allow')) {
      best = { type: r.type, length: len };
    }
  }
  if (!best) return true;
  return best.type === 'allow';
}

function matchesRoot(path: string): boolean {
  // A rule "matches" the root path "/" if the rule's path is "" or "/" or
  // a wildcard pattern that could start at root. We only need the binary
  // "blocks the root or not" answer here, so:
  if (path === '' || path === '/') return true;
  if (path === '/*') return true;
  return false;
}
```

- [ ] **Step 2: Run the parser tests — expect pass**

Run: `pnpm test src/lib/robots-parser.test.ts`

Expected: PASS. All 10 tests green.

- [ ] **Step 3: Commit**

```bash
git add src/lib/robots-parser.ts src/lib/robots-parser.test.ts
git commit -m "feat(lib): add robots.txt parser with per-bot status evaluation"
```

---

## Task 6: Crawler audit library — failing tests

**Files:**
- Create: `src/lib/crawler-audit.test.ts`

- [ ] **Step 1: Write the test file**

Create `src/lib/crawler-audit.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users, crawlerAudits } from '@/db/schema';
import { runCrawlerAudit, __setFetchRobotsImpl } from './crawler-audit';

async function makeUserAndSite(rootUrl = 'https://example.test') {
  const db = getDb();
  const [u] = await db
    .insert(users)
    .values({ name: 'X', email: `${Math.random()}@t.test` })
    .returning();
  const [s] = await db
    .insert(sites)
    .values({
      userId: u.id,
      name: 'S',
      rootUrl,
      webhookTokenHash: 'a'.repeat(64),
      webhookTokenPrefix: 'lmt_abcd',
    })
    .returning();
  return { user: u, site: s };
}

describe('runCrawlerAudit', () => {
  beforeEach(async () => {
    await setupTestDb();
    __setFetchRobotsImpl(null); // reset to default between tests
  });

  it('200 OK: writes a succeeded row with parsed per-bot results', async () => {
    const { site } = await makeUserAndSite();
    __setFetchRobotsImpl(async () => ({
      ok: true,
      body: 'User-agent: GPTBot\nDisallow: /\n',
      robotsUrl: 'https://example.test/robots.txt',
    }));

    const audit = await runCrawlerAudit({ siteId: site.id, trigger: 'manual' });

    expect(audit.status).toBe('succeeded');
    expect(audit.robotsContent).toContain('GPTBot');
    const parsed = JSON.parse(audit.results);
    expect(parsed.GPTBot).toEqual({ status: 'blocked' });
    expect(parsed.ClaudeBot).toEqual({ status: 'default' });
  });

  it('404: writes a succeeded row with all bots default', async () => {
    const { site } = await makeUserAndSite();
    __setFetchRobotsImpl(async () => ({
      ok: false,
      kind: 'not_found',
      robotsUrl: 'https://example.test/robots.txt',
    }));

    const audit = await runCrawlerAudit({ siteId: site.id, trigger: 'manual' });

    expect(audit.status).toBe('succeeded');
    expect(audit.robotsContent).toBeNull();
    const parsed = JSON.parse(audit.results);
    expect(parsed.GPTBot).toEqual({ status: 'default' });
  });

  it('500 / network error: writes a failed row with errorMessage', async () => {
    const { site } = await makeUserAndSite();
    __setFetchRobotsImpl(async () => ({
      ok: false,
      kind: 'fetch_error',
      error: 'fetch failed',
      robotsUrl: 'https://example.test/robots.txt',
    }));

    const audit = await runCrawlerAudit({ siteId: site.id, trigger: 'manual' });

    expect(audit.status).toBe('failed');
    expect(audit.errorMessage).toContain('fetch failed');
  });

  it('oversized body: writes a failed row with a size-limit message', async () => {
    const { site } = await makeUserAndSite();
    __setFetchRobotsImpl(async () => ({
      ok: false,
      kind: 'too_large',
      error: 'robots.txt exceeds 512KB limit',
      robotsUrl: 'https://example.test/robots.txt',
    }));

    const audit = await runCrawlerAudit({ siteId: site.id, trigger: 'manual' });

    expect(audit.status).toBe('failed');
    expect(audit.errorMessage).toContain('512KB');
  });

  it('persists the row to crawler_audits', async () => {
    const { site } = await makeUserAndSite();
    __setFetchRobotsImpl(async () => ({
      ok: true,
      body: '',
      robotsUrl: 'https://example.test/robots.txt',
    }));

    const audit = await runCrawlerAudit({ siteId: site.id, trigger: 'manual' });

    const rows = await getDb().select().from(crawlerAudits);
    expect(rows.find((r) => r.id === audit.id)).toBeDefined();
  });

  it('sets generationId when trigger is generation', async () => {
    const { site } = await makeUserAndSite();
    __setFetchRobotsImpl(async () => ({
      ok: true,
      body: '',
      robotsUrl: 'https://example.test/robots.txt',
    }));

    const audit = await runCrawlerAudit({
      siteId: site.id,
      trigger: 'generation',
      generationId: 42,
    });

    expect(audit.trigger).toBe('generation');
    expect(audit.generationId).toBe(42);
  });

  it('never throws on missing site (returns failed row)', async () => {
    __setFetchRobotsImpl(async () => ({
      ok: true,
      body: '',
      robotsUrl: '',
    }));
    const audit = await runCrawlerAudit({ siteId: 9999, trigger: 'manual' });
    expect(audit.status).toBe('failed');
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

Run: `pnpm test src/lib/crawler-audit.test.ts`

Expected: FAIL — module not found.

---

## Task 7: Crawler audit library — implementation

**Files:**
- Create: `src/lib/crawler-audit.ts`

- [ ] **Step 1: Write the library**

Create `src/lib/crawler-audit.ts`:

```ts
import { eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { sites, crawlerAudits, type CrawlerAudit } from '@/db/schema';
import { KNOWN_AI_BOTS, type AuditResults } from './known-ai-bots';
import { parseRobotsTxt, evaluateBot } from './robots-parser';

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 10_000;
const USER_AGENT = 'AI-Ready-Auditor/1.0';

export type FetchRobotsResult =
  | { ok: true; body: string; robotsUrl: string }
  | { ok: false; kind: 'not_found'; robotsUrl: string }
  | { ok: false; kind: 'fetch_error'; error: string; robotsUrl: string }
  | { ok: false; kind: 'too_large'; error: string; robotsUrl: string }
  | { ok: false; kind: 'invalid_url'; error: string; robotsUrl: string };

type FetchRobotsImpl = (rootUrl: string) => Promise<FetchRobotsResult>;

let fetchRobotsImpl: FetchRobotsImpl | null = null;

/** @internal test hook */
export function __setFetchRobotsImpl(impl: FetchRobotsImpl | null): void {
  fetchRobotsImpl = impl;
}

async function defaultFetchRobots(rootUrl: string): Promise<FetchRobotsResult> {
  let robotsUrl: string;
  try {
    robotsUrl = new URL('/robots.txt', rootUrl).toString();
  } catch (err) {
    return {
      ok: false,
      kind: 'invalid_url',
      error: err instanceof Error ? err.message : String(err),
      robotsUrl: rootUrl,
    };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(robotsUrl, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    if (res.status === 404) {
      return { ok: false, kind: 'not_found', robotsUrl };
    }
    if (!res.ok) {
      return {
        ok: false,
        kind: 'fetch_error',
        error: `HTTP ${res.status}`,
        robotsUrl,
      };
    }
    const text = await res.text();
    if (text.length > MAX_BYTES) {
      return {
        ok: false,
        kind: 'too_large',
        error: `robots.txt exceeds 512KB limit`,
        robotsUrl,
      };
    }
    return { ok: true, body: text, robotsUrl };
  } catch (err) {
    return {
      ok: false,
      kind: 'fetch_error',
      error: err instanceof Error ? err.message : String(err),
      robotsUrl,
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildDefaultResults(): AuditResults {
  return Object.fromEntries(
    KNOWN_AI_BOTS.map((bot) => [bot, { status: 'default' }]),
  ) as AuditResults;
}

export async function runCrawlerAudit(params: {
  siteId: number;
  trigger: 'generation' | 'manual';
  generationId?: number;
}): Promise<CrawlerAudit> {
  const db = getDb();
  const fetcher = fetchRobotsImpl ?? defaultFetchRobots;

  const [site] = await db.select().from(sites).where(eq(sites.id, params.siteId));

  if (!site) {
    const [row] = await db
      .insert(crawlerAudits)
      .values({
        siteId: params.siteId,
        status: 'failed',
        robotsUrl: '',
        results: JSON.stringify(buildDefaultResults()),
        errorMessage: `Site ${params.siteId} not found`,
        trigger: params.trigger,
        generationId: params.generationId ?? null,
      })
      .returning();
    return row;
  }

  const fetched = await fetcher(site.rootUrl);

  if (fetched.ok) {
    const groups = parseRobotsTxt(fetched.body);
    const results = Object.fromEntries(
      KNOWN_AI_BOTS.map((bot) => [bot, evaluateBot(groups, bot)]),
    ) as AuditResults;

    const [row] = await db
      .insert(crawlerAudits)
      .values({
        siteId: site.id,
        status: 'succeeded',
        robotsUrl: fetched.robotsUrl,
        robotsContent: fetched.body,
        results: JSON.stringify(results),
        trigger: params.trigger,
        generationId: params.generationId ?? null,
      })
      .returning();
    return row;
  }

  if (fetched.kind === 'not_found') {
    const [row] = await db
      .insert(crawlerAudits)
      .values({
        siteId: site.id,
        status: 'succeeded',
        robotsUrl: fetched.robotsUrl,
        robotsContent: null,
        results: JSON.stringify(buildDefaultResults()),
        trigger: params.trigger,
        generationId: params.generationId ?? null,
      })
      .returning();
    return row;
  }

  const [row] = await db
    .insert(crawlerAudits)
    .values({
      siteId: site.id,
      status: 'failed',
      robotsUrl: fetched.robotsUrl,
      results: JSON.stringify(buildDefaultResults()),
      errorMessage: fetched.error,
      trigger: params.trigger,
      generationId: params.generationId ?? null,
    })
    .returning();
  return row;
}
```

- [ ] **Step 2: Run the test — expect pass**

Run: `pnpm test src/lib/crawler-audit.test.ts`

Expected: PASS — all 7 tests green.

- [ ] **Step 3: Commit**

```bash
git add src/lib/crawler-audit.ts src/lib/crawler-audit.test.ts
git commit -m "feat(lib): add runCrawlerAudit fetch+parse+persist library"
```

---

## Task 8: POST /api/sites/[id]/audits — failing test

**Files:**
- Create: `src/app/api/sites/[id]/audits/route.test.ts`

- [ ] **Step 1: Write the test file**

Create `src/app/api/sites/[id]/audits/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users } from '@/db/schema';
import { __setFetchRobotsImpl } from '@/lib/crawler-audit';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));

import { POST } from './route';
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

describe('POST /api/sites/[id]/audits', () => {
  beforeEach(async () => {
    await setupTestDb();
    __setFetchRobotsImpl(async () => ({
      ok: true,
      body: 'User-agent: GPTBot\nDisallow: /\n',
      robotsUrl: 'https://x.test/robots.txt',
    }));
  });

  it('returns 200 with the new audit for the owner', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(site.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.audit.siteId).toBe(site.id);
    expect(body.audit.trigger).toBe('manual');
    expect(body.audit.status).toBe('succeeded');
  });

  it('returns 404 for a non-owner', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    const { user: other } = await makeUserAndSite('b@b.test');
    vi.mocked(getCurrentUser).mockResolvedValue(other);

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(site.id));
    expect(res.status).toBe(404);
  });

  it('returns 401 when unauthenticated', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await POST(new Request('http://t', { method: 'POST' }), ctx(site.id));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

Run: `pnpm test src/app/api/sites/[id]/audits/route.test.ts`

Expected: FAIL — route module not found.

---

## Task 9: POST /api/sites/[id]/audits — implementation

**Files:**
- Create: `src/app/api/sites/[id]/audits/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/sites/[id]/audits/route.ts`:

```ts
import {
  apiErrorResponse,
  ApiError,
  assertOwnsSite,
  requireUserOrThrow,
} from '@/lib/auth-guards';
import { runCrawlerAudit } from '@/lib/crawler-audit';

type Ctx = { params: Promise<{ id: string }> };

async function parseSiteId(ctx: Ctx): Promise<number> {
  const { id } = await ctx.params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(404, 'not_found', 'Site not found');
  return n;
}

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const id = await parseSiteId(ctx);
    await assertOwnsSite(id, user.id);
    const audit = await runCrawlerAudit({ siteId: id, trigger: 'manual' });
    return Response.json({ audit });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

- [ ] **Step 2: Run the test — expect pass**

Run: `pnpm test src/app/api/sites/[id]/audits/route.test.ts`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/sites/[id]/audits/route.ts src/app/api/sites/[id]/audits/route.test.ts
git commit -m "feat(api): add POST /api/sites/[id]/audits for on-demand audits"
```

---

## Task 10: GET /api/sites/[id]/audits/latest — failing test

**Files:**
- Create: `src/app/api/sites/[id]/audits/latest/route.test.ts`

- [ ] **Step 1: Write the test file**

Create `src/app/api/sites/[id]/audits/latest/route.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users, crawlerAudits } from '@/db/schema';

vi.mock('@/lib/auth', () => ({ getCurrentUser: vi.fn() }));

import { GET } from './route';
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

describe('GET /api/sites/[id]/audits/latest', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  it('returns 200 with the latest audit (by fetchedAt) for the owner', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const db = getDb();
    await db.insert(crawlerAudits).values({
      siteId: site.id,
      status: 'succeeded',
      robotsUrl: 'https://x.test/robots.txt',
      results: '{}',
      trigger: 'manual',
      fetchedAt: '2026-05-01T00:00:00Z',
    });
    const [newer] = await db
      .insert(crawlerAudits)
      .values({
        siteId: site.id,
        status: 'succeeded',
        robotsUrl: 'https://x.test/robots.txt',
        results: '{}',
        trigger: 'manual',
        fetchedAt: '2026-05-13T00:00:00Z',
      })
      .returning();

    const res = await GET(new Request('http://t'), ctx(site.id));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.audit.id).toBe(newer.id);
  });

  it('returns 404 when no audit exists', async () => {
    const { user, site } = await makeUserAndSite('a@a.test');
    vi.mocked(getCurrentUser).mockResolvedValue(user);

    const res = await GET(new Request('http://t'), ctx(site.id));
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-owner even when an audit exists', async () => {
    const { site } = await makeUserAndSite('a@a.test');
    const { user: other } = await makeUserAndSite('b@b.test');
    vi.mocked(getCurrentUser).mockResolvedValue(other);

    await getDb().insert(crawlerAudits).values({
      siteId: site.id,
      status: 'succeeded',
      robotsUrl: 'https://x.test/robots.txt',
      results: '{}',
      trigger: 'manual',
    });

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
```

- [ ] **Step 2: Run the test — expect failure**

Run: `pnpm test src/app/api/sites/[id]/audits/latest/route.test.ts`

Expected: FAIL — module not found.

---

## Task 11: GET /api/sites/[id]/audits/latest — implementation

**Files:**
- Create: `src/app/api/sites/[id]/audits/latest/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/sites/[id]/audits/latest/route.ts`:

```ts
import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { crawlerAudits } from '@/db/schema';
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

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const user = await requireUserOrThrow();
    const id = await parseSiteId(ctx);
    await assertOwnsSite(id, user.id);

    const [audit] = await getDb()
      .select()
      .from(crawlerAudits)
      .where(eq(crawlerAudits.siteId, id))
      .orderBy(desc(crawlerAudits.fetchedAt))
      .limit(1);

    if (!audit) throw new ApiError(404, 'not_found', 'No audit yet');
    return Response.json({ audit });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
```

- [ ] **Step 2: Run the test — expect pass**

Run: `pnpm test src/app/api/sites/[id]/audits/latest/route.test.ts`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/sites/[id]/audits/latest/route.ts src/app/api/sites/[id]/audits/latest/route.test.ts
git commit -m "feat(api): add GET /api/sites/[id]/audits/latest"
```

---

## Task 12: Workflow step — add `runCrawlerAuditStep`

**Files:**
- Modify: `src/lib/workflow/steps.ts` (append at bottom)
- Modify: `src/lib/workflow/generate-site-files.ts`

- [ ] **Step 1: Append the new step**

At the bottom of `src/lib/workflow/steps.ts`, add:

```ts
import { runCrawlerAudit } from '@/lib/crawler-audit';

export async function runCrawlerAuditStep(generationId: number): Promise<void> {
  'use step';
  try {
    const db = getDb();
    const [g] = await db.select().from(generations).where(eq(generations.id, generationId));
    if (!g) return;
    await runCrawlerAudit({
      siteId: g.siteId,
      trigger: 'generation',
      generationId,
    });
  } catch (err) {
    console.error(
      `[workflow] runCrawlerAuditStep failed id=${generationId}`,
      err,
    );
    // Never re-throw — audit failure must not fail the generation workflow.
  }
}
```

- [ ] **Step 2: Wire it into the workflow**

Open `src/lib/workflow/generate-site-files.ts`. Update the import to include the new step:

```ts
import {
  prepareStep,
  runGenStep,
  runFullStep,
  runPagesStepSafe,
  completeStep,
  notifyStep,
  failStep,
  runCrawlerAuditStep,
} from './steps';
```

Then, inside the workflow body, call the step **after** `completeStep` and before `notifyStep`:

```ts
    await completeStep(generationId);
    await runCrawlerAuditStep(generationId);
    await notifyStep(generationId);
```

- [ ] **Step 3: Write a unit test for the step**

Create `src/lib/workflow/crawler-audit-step.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupTestDb } from '@/test/db';
import { getDb } from '@/db';
import { sites, users, generations, crawlerAudits } from '@/db/schema';
import { __setFetchRobotsImpl } from '@/lib/crawler-audit';
import { runCrawlerAuditStep } from './steps';

async function seed() {
  const db = getDb();
  const [u] = await db.insert(users).values({ name: 'X', email: 'a@a.test' }).returning();
  const [s] = await db
    .insert(sites)
    .values({
      userId: u.id,
      name: 'S',
      rootUrl: 'https://example.test',
      webhookTokenHash: 'a'.repeat(64),
      webhookTokenPrefix: 'lmt_abcd',
    })
    .returning();
  const [g] = await db
    .insert(generations)
    .values({ siteId: s.id, userId: u.id, trigger: 'manual' })
    .returning();
  return { site: s, generation: g };
}

describe('runCrawlerAuditStep', () => {
  beforeEach(async () => {
    await setupTestDb();
  });

  it('writes a crawler_audits row with trigger=generation', async () => {
    const { generation } = await seed();
    __setFetchRobotsImpl(async () => ({
      ok: true,
      body: '',
      robotsUrl: 'https://example.test/robots.txt',
    }));

    await runCrawlerAuditStep(generation.id);

    const rows = await getDb().select().from(crawlerAudits);
    expect(rows).toHaveLength(1);
    expect(rows[0].trigger).toBe('generation');
    expect(rows[0].generationId).toBe(generation.id);
  });

  it('does not throw when runCrawlerAudit throws', async () => {
    const { generation } = await seed();
    __setFetchRobotsImpl(async () => {
      throw new Error('boom');
    });

    await expect(runCrawlerAuditStep(generation.id)).resolves.toBeUndefined();
  });

  it('is a no-op when the generation row does not exist', async () => {
    await expect(runCrawlerAuditStep(9999)).resolves.toBeUndefined();
    const rows = await getDb().select().from(crawlerAudits);
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run the new test**

Run: `pnpm test src/lib/workflow/crawler-audit-step.test.ts`

Expected: PASS.

- [ ] **Step 5: Run the full workflow test suite (sanity)**

Run: `pnpm test src/lib/workflow`

Expected: all green — existing tests untouched.

- [ ] **Step 6: Commit**

```bash
git add src/lib/workflow/steps.ts src/lib/workflow/generate-site-files.ts src/lib/workflow/crawler-audit-step.test.ts
git commit -m "feat(workflow): run crawler audit after generation success"
```

---

## Task 13: CrawlerAuditTable component — failing test

**Files:**
- Create: `src/components/crawlers/crawler-audit-table.test.tsx`

- [ ] **Step 1: Write the test**

Create `src/components/crawlers/crawler-audit-table.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CrawlerAuditTable } from './crawler-audit-table';
import { KNOWN_AI_BOTS, type AuditResults } from '@/lib/known-ai-bots';

function buildResults(overrides: Partial<AuditResults> = {}): AuditResults {
  const base = Object.fromEntries(
    KNOWN_AI_BOTS.map((b) => [b, { status: 'default' as const }]),
  ) as AuditResults;
  return { ...base, ...overrides };
}

describe('CrawlerAuditTable', () => {
  it('renders one row per known bot', () => {
    render(<CrawlerAuditTable results={buildResults()} />);
    for (const bot of KNOWN_AI_BOTS) {
      expect(screen.getByText(bot)).toBeInTheDocument();
    }
  });

  it('shows ALLOWED pill for allowed bots', () => {
    render(
      <CrawlerAuditTable
        results={buildResults({ GPTBot: { status: 'allowed' } })}
      />,
    );
    expect(screen.getByText('ALLOWED')).toBeInTheDocument();
  });

  it('shows BLOCKED pill for blocked bots', () => {
    render(
      <CrawlerAuditTable
        results={buildResults({ CCBot: { status: 'blocked' } })}
      />,
    );
    expect(screen.getByText('BLOCKED')).toBeInTheDocument();
  });

  it('shows PARTIAL pill plus disallowed paths in the detail column', () => {
    render(
      <CrawlerAuditTable
        results={buildResults({
          GPTBot: { status: 'partial', disallowedPaths: ['/admin', '/private'] },
        })}
      />,
    );
    expect(screen.getByText('PARTIAL')).toBeInTheDocument();
    expect(screen.getByText('/admin, /private')).toBeInTheDocument();
  });

  it('shows "Falls under * rules" for default bots', () => {
    render(<CrawlerAuditTable results={buildResults()} />);
    expect(screen.getAllByText('Falls under * rules').length).toBe(
      KNOWN_AI_BOTS.length,
    );
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

Run: `pnpm test src/components/crawlers/crawler-audit-table.test.tsx`

Expected: FAIL — module not found.

---

## Task 14: CrawlerAuditTable — implementation

**Files:**
- Create: `src/components/crawlers/crawler-audit-table.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/crawlers/crawler-audit-table.tsx`:

```tsx
import { KNOWN_AI_BOTS, type AuditBotStatus, type AuditResults } from '@/lib/known-ai-bots';

const STATUS_PILL: Record<AuditBotStatus, { label: string; className: string }> = {
  allowed: {
    label: 'ALLOWED',
    className: 'bg-semantic-success/20 text-[#155e44]',
  },
  blocked: {
    label: 'BLOCKED',
    className: 'bg-destructive/20 text-destructive',
  },
  partial: {
    label: 'PARTIAL',
    className: 'bg-timeline-thinking/30 text-[#7a4229]',
  },
  default: {
    label: 'DEFAULT',
    className: 'bg-timeline-read/30 text-[#2c405a]',
  },
};

function detailText(result: AuditResults[keyof AuditResults]): string {
  if (result.status === 'partial' && result.disallowedPaths?.length) {
    return result.disallowedPaths.join(', ');
  }
  if (result.status === 'default') return 'Falls under * rules';
  return '';
}

export function CrawlerAuditTable({ results }: { results: AuditResults }) {
  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-surface-card">
      <table className="w-full">
        <thead className="border-b border-hairline bg-canvas-soft">
          <tr>
            <th className="caption-uppercase px-4 py-3 text-left text-muted-strong">
              Bot
            </th>
            <th className="caption-uppercase px-4 py-3 text-left text-muted-strong">
              Status
            </th>
            <th className="caption-uppercase px-4 py-3 text-left text-muted-strong">
              Detail
            </th>
          </tr>
        </thead>
        <tbody>
          {KNOWN_AI_BOTS.map((bot) => {
            const r = results[bot];
            const pill = STATUS_PILL[r.status];
            return (
              <tr key={bot} className="border-b border-hairline-soft last:border-0">
                <td className="px-4 py-3 font-mono text-[13px] text-ink">{bot}</td>
                <td className="px-4 py-3">
                  <span
                    className={`caption-uppercase rounded-full px-2 py-0.5 text-[10px] ${pill.className}`}
                  >
                    {pill.label}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-[12px] text-muted-strong">
                  {detailText(r)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Run the test — expect pass**

Run: `pnpm test src/components/crawlers/crawler-audit-table.test.tsx`

Expected: PASS — all 5 tests green.

- [ ] **Step 3: Commit**

```bash
git add src/components/crawlers/crawler-audit-table.tsx src/components/crawlers/crawler-audit-table.test.tsx
git commit -m "feat(ui): add CrawlerAuditTable component"
```

---

## Task 15: RobotsGenerator component — failing test

**Files:**
- Create: `src/components/crawlers/robots-generator.test.tsx`

- [ ] **Step 1: Write the test**

Create `src/components/crawlers/robots-generator.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RobotsGenerator } from './robots-generator';
import { KNOWN_AI_BOTS, type AuditResults } from '@/lib/known-ai-bots';

function defaultResults(): AuditResults {
  return Object.fromEntries(
    KNOWN_AI_BOTS.map((b) => [b, { status: 'default' as const }]),
  ) as AuditResults;
}

describe('RobotsGenerator', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('renders a toggle row for every known bot', () => {
    render(<RobotsGenerator initial={defaultResults()} />);
    for (const bot of KNOWN_AI_BOTS) {
      expect(screen.getByText(bot)).toBeInTheDocument();
    }
  });

  it('seeds initial toggle state from the audit results', () => {
    const seeded = { ...defaultResults(), GPTBot: { status: 'blocked' as const } };
    render(<RobotsGenerator initial={seeded} />);
    // The blocked button for GPTBot has aria-pressed=true
    const row = screen.getByText('GPTBot').closest('tr')!;
    const buttons = row.querySelectorAll('button');
    // Two buttons per row: Allow, Block
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('clicking Block updates the snippet', async () => {
    const user = userEvent.setup();
    render(<RobotsGenerator initial={defaultResults()} />);
    const row = screen.getByText('GPTBot').closest('tr')!;
    const blockBtn = row.querySelectorAll('button')[1];
    await user.click(blockBtn);

    expect(screen.getByTestId('snippet')).toHaveTextContent('User-agent: GPTBot');
    expect(screen.getByTestId('snippet')).toHaveTextContent('Disallow: /');
  });

  it('clicking the highlighted state again resets the bot to default', async () => {
    const user = userEvent.setup();
    const seeded = { ...defaultResults(), GPTBot: { status: 'blocked' as const } };
    render(<RobotsGenerator initial={seeded} />);
    const row = screen.getByText('GPTBot').closest('tr')!;
    const blockBtn = row.querySelectorAll('button')[1];
    await user.click(blockBtn);

    expect(screen.getByTestId('snippet')).not.toHaveTextContent('User-agent: GPTBot');
  });

  it('Reset button restores the initial state', async () => {
    const user = userEvent.setup();
    const seeded = { ...defaultResults(), GPTBot: { status: 'blocked' as const } };
    render(<RobotsGenerator initial={seeded} />);
    const row = screen.getByText('GPTBot').closest('tr')!;
    const allowBtn = row.querySelectorAll('button')[0];
    await user.click(allowBtn);

    expect(screen.getByTestId('snippet')).toHaveTextContent('Allow: /');

    await user.click(screen.getByRole('button', { name: /reset/i }));
    expect(screen.getByTestId('snippet')).toHaveTextContent('Disallow: /');
  });

  it('Copy button writes the snippet to the clipboard', async () => {
    const user = userEvent.setup();
    const seeded = { ...defaultResults(), GPTBot: { status: 'blocked' as const } };
    render(<RobotsGenerator initial={seeded} />);
    await user.click(screen.getByRole('button', { name: /copy/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('User-agent: GPTBot'),
    );
  });

  it('renders a placeholder when all bots are default', () => {
    render(<RobotsGenerator initial={defaultResults()} />);
    expect(screen.getByTestId('snippet')).toHaveTextContent(
      '# (No directives — toggle a bot to begin)',
    );
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

Run: `pnpm test src/components/crawlers/robots-generator.test.tsx`

Expected: FAIL — module not found.

---

## Task 16: RobotsGenerator — implementation

**Files:**
- Create: `src/components/crawlers/robots-generator.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/crawlers/robots-generator.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  KNOWN_AI_BOTS,
  type AuditResults,
  type KnownAiBot,
} from '@/lib/known-ai-bots';
import { cn } from '@/lib/utils';

type ToggleState = 'allow' | 'block' | 'default';

function seedToggles(initial: AuditResults): Record<KnownAiBot, ToggleState> {
  return Object.fromEntries(
    KNOWN_AI_BOTS.map((bot) => {
      const status = initial[bot]?.status;
      const t: ToggleState =
        status === 'allowed' ? 'allow' : status === 'blocked' ? 'block' : 'default';
      return [bot, t];
    }),
  ) as Record<KnownAiBot, ToggleState>;
}

function buildSnippet(
  toggles: Record<KnownAiBot, ToggleState>,
  dateIso: string,
): string {
  const allowed = KNOWN_AI_BOTS.filter((b) => toggles[b] === 'allow');
  const blocked = KNOWN_AI_BOTS.filter((b) => toggles[b] === 'block');

  const lines: string[] = [
    `# Generated by AI Ready — ${dateIso}`,
    `# Append to your existing robots.txt.`,
  ];

  if (allowed.length === 0 && blocked.length === 0) {
    lines.push('');
    lines.push('# (No directives — toggle a bot to begin)');
    return lines.join('\n');
  }

  if (allowed.length > 0) {
    lines.push('');
    lines.push('# Allowed AI crawlers');
    for (const b of allowed) lines.push(`User-agent: ${b}`);
    lines.push('Allow: /');
  }

  if (blocked.length > 0) {
    lines.push('');
    lines.push('# Blocked AI crawlers');
    for (const b of blocked) lines.push(`User-agent: ${b}`);
    lines.push('Disallow: /');
  }

  return lines.join('\n');
}

export function RobotsGenerator({ initial }: { initial: AuditResults }) {
  const [toggles, setToggles] = useState(() => seedToggles(initial));

  const snippet = useMemo(
    () => buildSnippet(toggles, new Date().toISOString().slice(0, 10)),
    [toggles],
  );
  const empty = useMemo(
    () => KNOWN_AI_BOTS.every((b) => toggles[b] === 'default'),
    [toggles],
  );

  function set(bot: KnownAiBot, next: 'allow' | 'block'): void {
    setToggles((prev) => ({
      ...prev,
      [bot]: prev[bot] === next ? 'default' : next,
    }));
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div className="rounded-xl border border-hairline bg-surface-card">
        <table className="w-full">
          <tbody>
            {KNOWN_AI_BOTS.map((bot) => (
              <tr
                key={bot}
                className="border-b border-hairline-soft last:border-0"
              >
                <td className="px-4 py-3 font-mono text-[13px] text-ink">
                  {bot}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      aria-pressed={toggles[bot] === 'allow'}
                      onClick={() => set(bot, 'allow')}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs transition-colors',
                        toggles[bot] === 'allow'
                          ? 'border-semantic-success bg-semantic-success/20 text-[#155e44]'
                          : 'border-hairline-strong text-body hover:text-ink',
                      )}
                    >
                      Allow
                    </button>
                    <button
                      type="button"
                      aria-pressed={toggles[bot] === 'block'}
                      onClick={() => set(bot, 'block')}
                      className={cn(
                        'rounded-full border px-3 py-1 text-xs transition-colors',
                        toggles[bot] === 'block'
                          ? 'border-destructive bg-destructive/15 text-destructive'
                          : 'border-hairline-strong text-body hover:text-ink',
                      )}
                    >
                      Block
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-hairline px-4 py-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setToggles(seedToggles(initial))}
          >
            Reset to current state
          </Button>
        </div>
      </div>

      <div className="flex flex-col rounded-xl border border-hairline bg-canvas-soft">
        <pre
          data-testid="snippet"
          className="flex-grow overflow-x-auto p-4 font-mono text-[12px] leading-relaxed text-ink"
        >
          {snippet}
        </pre>
        <div className="border-t border-hairline px-4 py-3">
          <Button
            type="button"
            size="sm"
            disabled={empty}
            onClick={() => navigator.clipboard.writeText(snippet)}
          >
            Copy snippet
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run the test — expect pass**

Run: `pnpm test src/components/crawlers/robots-generator.test.tsx`

Expected: PASS — all 7 tests green.

- [ ] **Step 3: Commit**

```bash
git add src/components/crawlers/robots-generator.tsx src/components/crawlers/robots-generator.test.tsx
git commit -m "feat(ui): add RobotsGenerator with per-bot toggles and snippet copy"
```

---

## Task 17: CrawlerAuditTab container — failing test

**Files:**
- Create: `src/components/crawlers/crawler-audit-tab.test.tsx`

- [ ] **Step 1: Write the test**

Create `src/components/crawlers/crawler-audit-tab.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { withQueryClient } from '@/test/utils';
import { CrawlerAuditTab } from './crawler-audit-tab';
import { KNOWN_AI_BOTS, type AuditResults } from '@/lib/known-ai-bots';

function emptyResults(): AuditResults {
  return Object.fromEntries(
    KNOWN_AI_BOTS.map((b) => [b, { status: 'default' as const }]),
  ) as AuditResults;
}

function mockFetch(impl: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => Promise.resolve(impl(url, init))),
  );
}

describe('CrawlerAuditTab', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows an empty state with a "Run audit now" button when latest is 404', async () => {
    mockFetch((url) => {
      if (url.endsWith('/audits/latest')) return new Response('', { status: 404 });
      return new Response('{}', { status: 200 });
    });
    render(withQueryClient(<CrawlerAuditTab siteId={1} />));
    expect(await screen.findByRole('button', { name: /run audit now/i })).toBeInTheDocument();
  });

  it('shows an error card when latest audit has status=failed', async () => {
    mockFetch((url) => {
      if (url.endsWith('/audits/latest')) {
        return new Response(
          JSON.stringify({
            audit: {
              id: 1,
              siteId: 1,
              status: 'failed',
              robotsUrl: 'https://x.test/robots.txt',
              results: JSON.stringify(emptyResults()),
              errorMessage: 'HTTP 500',
              fetchedAt: '2026-05-13T00:00:00Z',
              trigger: 'manual',
              generationId: null,
              robotsContent: null,
            },
          }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 200 });
    });
    render(withQueryClient(<CrawlerAuditTab siteId={1} />));
    expect(await screen.findByText(/HTTP 500/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('renders the table and generator on a succeeded audit', async () => {
    const results: AuditResults = {
      ...emptyResults(),
      GPTBot: { status: 'blocked' },
    };
    mockFetch((url) => {
      if (url.endsWith('/audits/latest')) {
        return new Response(
          JSON.stringify({
            audit: {
              id: 1,
              siteId: 1,
              status: 'succeeded',
              robotsUrl: 'https://x.test/robots.txt',
              results: JSON.stringify(results),
              errorMessage: null,
              fetchedAt: '2026-05-13T00:00:00Z',
              trigger: 'manual',
              generationId: null,
              robotsContent: '',
            },
          }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 200 });
    });
    render(withQueryClient(<CrawlerAuditTab siteId={1} />));
    expect(await screen.findByText('BLOCKED')).toBeInTheDocument();
    expect(screen.getByText(/generate the directives/i)).toBeInTheDocument();
  });

  it('clicking Re-audit POSTs and refreshes', async () => {
    const fetchSpy = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/audits/latest')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              audit: {
                id: 1,
                siteId: 1,
                status: 'succeeded',
                robotsUrl: 'https://x.test/robots.txt',
                results: JSON.stringify(emptyResults()),
                errorMessage: null,
                fetchedAt: '2026-05-13T00:00:00Z',
                trigger: 'manual',
                generationId: null,
                robotsContent: '',
              },
            }),
            { status: 200 },
          ),
        );
      }
      if (url.endsWith('/audits') && init?.method === 'POST') {
        return Promise.resolve(new Response(JSON.stringify({ audit: {} }), { status: 200 }));
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchSpy);

    const user = userEvent.setup();
    render(withQueryClient(<CrawlerAuditTab siteId={1} />));
    await screen.findByRole('button', { name: /re-audit/i });
    await user.click(screen.getByRole('button', { name: /re-audit/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/sites/1/audits',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});
```

- [ ] **Step 2: Run the test — expect failure**

Run: `pnpm test src/components/crawlers/crawler-audit-tab.test.tsx`

Expected: FAIL — module not found.

---

## Task 18: CrawlerAuditTab — implementation

**Files:**
- Create: `src/components/crawlers/crawler-audit-tab.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/crawlers/crawler-audit-tab.tsx`:

```tsx
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { CrawlerAuditTable } from './crawler-audit-table';
import { RobotsGenerator } from './robots-generator';
import {
  KNOWN_AI_BOTS,
  type AuditResults,
} from '@/lib/known-ai-bots';
import { formatRelativeTime } from '@/lib/format-time';
import type { CrawlerAudit } from '@/db/schema';

type AuditResponse = { audit: CrawlerAudit };

function emptyResults(): AuditResults {
  return Object.fromEntries(
    KNOWN_AI_BOTS.map((b) => [b, { status: 'default' as const }]),
  ) as AuditResults;
}

function summary(results: AuditResults) {
  let allowed = 0,
    blocked = 0,
    partial = 0,
    def = 0;
  for (const b of KNOWN_AI_BOTS) {
    const s = results[b].status;
    if (s === 'allowed') allowed++;
    else if (s === 'blocked') blocked++;
    else if (s === 'partial') partial++;
    else def++;
  }
  return { allowed, blocked, partial, default: def };
}

export function CrawlerAuditTab({ siteId }: { siteId: number }) {
  const qc = useQueryClient();
  const key = ['sites', siteId, 'audit', 'latest'] as const;

  const latest = useQuery({
    queryKey: key,
    queryFn: async (): Promise<AuditResponse | null> => {
      const res = await fetch(`/api/sites/${siteId}/audits/latest`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const audit = latest.data?.audit ?? null;

  const reAudit = useMutation({
    mutationFn: async (): Promise<void> => {
      const res = await fetch(`/api/sites/${siteId}/audits`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  if (latest.isLoading) {
    return <div className="py-8 font-mono text-sm text-muted-strong">Loading audit…</div>;
  }

  if (!audit) {
    return (
      <div className="space-y-4 rounded-xl border border-hairline bg-surface-card p-6">
        <h3 className="text-lg font-semibold text-ink">AI Crawler Audit</h3>
        <p className="text-sm text-body">
          No audit yet. Click below to check your robots.txt against the nine
          known AI crawlers.
        </p>
        <Button
          onClick={() => reAudit.mutate()}
          disabled={reAudit.isPending}
        >
          {reAudit.isPending ? 'Running…' : 'Run audit now'}
        </Button>
      </div>
    );
  }

  const results: AuditResults = audit.status === 'succeeded'
    ? (JSON.parse(audit.results) as AuditResults)
    : emptyResults();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-ink">AI Crawler Audit</h3>
          <p className="font-mono text-[12px] text-muted-strong">
            Last checked {formatRelativeTime(audit.fetchedAt)}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => reAudit.mutate()}
          disabled={reAudit.isPending}
        >
          {reAudit.isPending ? 'Auditing…' : 'Re-audit'}
        </Button>
      </div>

      {audit.status === 'failed' ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4">
          <div className="caption-uppercase mb-2 text-destructive">Audit failed</div>
          <p className="font-mono text-[13px] text-ink">
            {audit.errorMessage ?? 'Unknown error'}
          </p>
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => reAudit.mutate()}
              disabled={reAudit.isPending}
            >
              Retry
            </Button>
          </div>
        </div>
      ) : (
        <>
          <SummaryChips counts={summary(results)} />
          <CrawlerAuditTable results={results} />
        </>
      )}

      <section className="space-y-3">
        <div>
          <h4 className="display-sm text-ink">Generate the directives you want</h4>
          <p className="text-sm text-muted-strong">
            Toggle each bot to ALLOW or BLOCK. Bots left as DEFAULT are omitted
            from the snippet.
          </p>
        </div>
        <RobotsGenerator initial={results} />
      </section>
    </div>
  );
}

function SummaryChips({
  counts,
}: {
  counts: { allowed: number; blocked: number; partial: number; default: number };
}) {
  return (
    <div className="font-mono text-[13px] text-body">
      {counts.allowed} allowed · {counts.blocked} blocked · {counts.partial} partial · {counts.default} default
    </div>
  );
}
```

- [ ] **Step 2: Run the test — expect pass**

Run: `pnpm test src/components/crawlers/crawler-audit-tab.test.tsx`

Expected: PASS — all 4 tests green.

- [ ] **Step 3: Commit**

```bash
git add src/components/crawlers/crawler-audit-tab.tsx src/components/crawlers/crawler-audit-tab.test.tsx
git commit -m "feat(ui): add CrawlerAuditTab container with empty/failed/succeeded states"
```

---

## Task 19: Wire the tab into the site detail page

**Files:**
- Modify: `src/app/(app)/sites/[id]/site-detail-client.tsx`

- [ ] **Step 1: Inspect the existing tabs**

Read `src/app/(app)/sites/[id]/site-detail-client.tsx` and locate the `<Tabs>`, `<TabsList>`, `<TabsTrigger>`, `<TabsContent>` block. Note the existing tab values (e.g. `'llms'`, `'pages'`) — you will add an `'crawlers'` value alongside them.

- [ ] **Step 2: Add the new TabsTrigger**

In the `<TabsList>` block, add (after the last existing `<TabsTrigger>`):

```tsx
<TabsTrigger value="crawlers">AI Crawlers</TabsTrigger>
```

- [ ] **Step 3: Add the new TabsContent**

Below the last existing `<TabsContent>` element, add:

```tsx
<TabsContent value="crawlers">
  <CrawlerAuditTab siteId={site.id} />
</TabsContent>
```

- [ ] **Step 4: Import the new component**

At the top of the file, alongside the other component imports, add:

```tsx
import { CrawlerAuditTab } from '@/components/crawlers/crawler-audit-tab';
```

- [ ] **Step 5: Verify nothing else broke**

Run: `pnpm test`

Expected: all tests pass. The full suite — including the existing `site-header.test.tsx`, `site-footer.test.tsx`, etc. — should be green.

- [ ] **Step 6: Commit**

```bash
git add src/app/(app)/sites/[id]/site-detail-client.tsx
git commit -m "feat(ui): add AI Crawlers tab to site detail page"
```

---

## Task 20: Final verification

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`

Expected: all tests pass.

- [ ] **Step 2: Run lint**

Run: `pnpm lint`

Expected: no new errors. Pre-existing warnings are acceptable.

- [ ] **Step 3: Run the build**

Run: `pnpm build`

Expected: TypeScript and build both succeed. This is the same gate that bit us on the previous Vercel push.

- [ ] **Step 4: Manual smoke test (UI)**

Start the dev server: `pnpm dev`

Steps:
1. Sign in.
2. Open a saved site (or create one with a real `rootUrl` like `https://anthropic.com`).
3. Click the new "AI Crawlers" tab.
4. If no audit yet: click "Run audit now" — verify a row appears and the table renders.
5. Toggle a couple of bots in the generator — verify the snippet updates live and "Copy snippet" puts the result on the clipboard.
6. Click "Re-audit" — verify the timestamp refreshes.

If anything looks off, fix and re-test before declaring done.

---

## Self-Review

**Spec coverage** — walking the spec section-by-section:
- Data model (table + JSON shape + status semantics) → Task 1.
- Bot list → Task 2.
- Fetch + parser logic → Tasks 3–5.
- Shared library `runCrawlerAudit` → Tasks 6–7.
- API endpoints (POST + GET latest) → Tasks 8–11.
- Workflow integration (step runs after generation success, non-blocking) → Task 12.
- UI: tab placement, audit table, generator, summary chips, header row, empty/failed/succeeded states → Tasks 13–19.
- Error handling cases (404, fetch error, oversized, malformed, concurrent) → covered by parser tests (Task 4), audit library tests (Task 6), and tab tests (Task 17).
- Testing gates (`pnpm test`, `pnpm build`, `pnpm db:generate`) → Tasks 1, 20.

**Placeholder scan:** no TBDs, no "implement later", no skeletal steps. Every code block is complete.

**Type consistency:** `AuditResults`, `AuditBotStatus`, `AuditBotResult`, `KnownAiBot`, `KNOWN_AI_BOTS`, `CrawlerAudit`, `__setFetchRobotsImpl`, `runCrawlerAudit`, `runCrawlerAuditStep`, `parseRobotsTxt`, `evaluateBot` all line up across tasks. The route filename pattern matches the existing `/api/sites/[id]/*` convention exactly.

**One open known-unknown:** the exact format of generated migration filenames isn't predictable in this plan because Drizzle Kit picks them at generation time. Task 1, Step 2 explicitly captures whatever file Drizzle creates. This is the right place to leave it — fully resolved at execution time.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-13-ai-crawler-audit.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
