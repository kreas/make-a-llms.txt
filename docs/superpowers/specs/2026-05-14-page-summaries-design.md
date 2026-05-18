# Page Summaries — Design

**Date:** 2026-05-14
**Status:** Approved (design phase)
**Surface:** Generation workflow (new step) + page markdown blobs
**Scope:** Add LLM-generated summaries to every page produced by a generation,
filling the `summary:` frontmatter field that is currently left empty.

## Problem

`runPagesStepSafe` already fetches a markdown rendering of every URL in a
site's sitemap, writes it to Vercel Blob with a frontmatter header, and
publishes a manifest. The header has a `summary:` field, but it is always
written empty — there is a comment in `buildFrontmatter` that says it is
"left empty until a follow-up LLM step fills it in." This spec is that
follow-up step.

## Goals

- Every successful page in a generation gets a short, declarative summary
  written into its blob's frontmatter.
- Every page also gets a `page_type` classification (homepage, service,
  product, article, case_study, about, other) written to the same
  frontmatter.
- The step survives per-page failures and reports counts so users (and we)
  can tell how the run went.
- Generations remain a coherent unit: pages and summaries succeed or fail
  together as one user-visible run.

## Non-Goals (v1)

- No re-summarization of previously generated runs. Each generation produces
  its own immutable artifacts; old runs are not retroactively touched.
- No on-demand "summarize one page" UI. Summaries are part of every
  generation.
- No per-site or per-user model selection. The model is fixed.
- No cost dashboard or per-run cost UI.
- No promotion of `page_type` to a top-level UI filter. It is recorded in
  the frontmatter and the manifest; surfacing it in product UI is a later
  decision.

## Decisions Locked In

| Question | Decision |
| --- | --- |
| When does summarization run? | New `'use step'` after `runPagesStepSafe`, before `completeStep`, in the same workflow. |
| What goes to the model? | The full markdown body, capped by a size guard to keep cost predictable. |
| Summary shape | Defined by the verbatim prompt (2 sentences, 60-word hard cap, strict structure). |
| Entity name source | `sites.name` as-is. |
| Page type source | Model returns `{ summary, page_type }` from a single `generateObject` call. |
| Storage | Dedicated step re-reads each blob, calls the model, and rewrites the blob with `summary` and `page_type` filled into frontmatter. |
| Failure model | Per-page resilient. Failed pages keep an empty `summary:`. Step succeeds as long as it ran. |
| `[NO_SUMMARY]` handling | Treated as intentional empty. The literal string is not written to the file. Counted separately from errors. |
| Concurrency | `runWithPool` with default `AI_SUMMARY_CONCURRENCY=15`. |
| Provider wiring | AI SDK v6 via AI Gateway. Model passed as the literal string `'google/gemini-3.1-flash-lite'`. No `@ai-sdk/google` package install. |

## Architecture

### Step placement

```
prepareStep
  └─ runGenStep + runFullStep + runPagesStepSafe + runCrawlerAuditStep
       └─ runSummariesStepSafe   ◀── NEW
            └─ completeStep
                 └─ notifyStep
```

`runSummariesStepSafe` is a new `'use step'` in `src/lib/workflow/steps.ts`,
modeled directly on `runPagesStepSafe`. It:

- Reads its status fields off the `generations` row.
- Honors the same cancellation check (`readCancelled`).
- Wraps everything in a `try/catch` so step-level errors set
  `summariesStatus = 'failed'` rather than propagating.
- Skips (sets `summariesStatus = 'skipped'`) when the upstream
  `pagesStatus` is not `succeeded`, when no pages manifest exists, or
  when the manifest contains zero `ok` page results.

### Provider

The AI SDK call uses AI Gateway with a `provider/model` string. In
production this authenticates via Vercel's OIDC token; locally it uses
`AI_GATEWAY_API_KEY`. If neither is present the step sets
`summariesStatus = 'failed'` with a clear error and exits without
attempting any model calls.

## Data model

### `generations` table — new columns

A new Drizzle migration adds these fields, mirroring the existing `pages*`
set:

```ts
summariesStatus: text('summaries_status', {
  enum: ['pending', 'running', 'succeeded', 'failed', 'skipped', 'cancelled'],
}).notNull().default('pending'),
summariesCount: integer('summaries_count').notNull().default(0),
summariesEmptyCount: integer('summaries_empty_count').notNull().default(0),
summariesFailedCount: integer('summaries_failed_count').notNull().default(0),
summariesManifestBlobPath: text('summaries_manifest_blob_path'),
summariesErrorMessage: text('summaries_error_message'),
```

- `summariesCount` — pages where a non-empty summary was written.
- `summariesEmptyCount` — pages where the model returned `[NO_SUMMARY]`.
- `summariesFailedCount` — pages where the call ultimately errored after
  AI SDK's built-in retries.

### Frontmatter changes

`buildFrontmatter` gains an optional `pageType` parameter and emits a
`page_type:` line when present:

```
title: Civilization
url: https://civilization.dev
summary: Civilization builds AI-native marketing tools for Fortune 500 clients...
page_type: homepage
updated: 2026-05-14
```

A new `parseFrontmatter` helper lives next to it, returning
`{ fields, body }`. This is what the summary step uses to read existing
fields, replace the summary, and rewrite the file.

### Summaries manifest

`gens/{generationId}/summaries-manifest.json` is written once per run when
at least one page is attempted. Shape:

```ts
type SummaryResult =
  | { url: string; path: string; status: 'ok'; pageType: PageType; summaryBytes: number; durationMs: number }
  | { url: string; path: string; status: 'empty'; pageType: PageType; durationMs: number } // NO_SUMMARY
  | { url: string; path: string; status: 'failed'; reason: string; durationMs: number };

type SummariesManifest = {
  generationId: number;
  generatedAt: string;
  okCount: number;
  emptyCount: number;
  failedCount: number;
  results: SummaryResult[];
};
```

The manifest is observability only — DB counts are authoritative for UI.

## Per-page flow inside `runSummariesStepSafe`

For each successful page from the pages manifest:

1. **Read** the existing blob at `gens/{generationId}/pages/{path}.md`
   from Vercel Blob.
2. **Parse** frontmatter and body using `parseFrontmatter`.
3. **Size guard.** If the body exceeds `AI_SUMMARY_MAX_INPUT_BYTES`
   (default ~200 KB), keep the leading bytes up to the cap, drop the
   remainder, and append a `\n\n[truncated]\n` marker before sending.
4. **Call** `generateObject` with model
   `'google/gemini-3.1-flash-lite'`, the `summarySchema` (Zod), and the
   prompt produced by `buildSummaryPrompt`.
5. **Interpret the result.**
   - If the model's `summary` is the literal `'[NO_SUMMARY]'` or an empty
     string after trimming, treat as `empty`: rewrite the blob with
     `summary:` blank and `page_type:` set. Tally as
     `summariesEmptyCount`.
   - Otherwise `ok`: rewrite the blob with `summary` and `page_type` both
     filled in. Tally as `summariesCount`.
6. **On error** (post-retry), do not rewrite the blob. Tally as
   `summariesFailedCount` and record the reason in the manifest.

The loop runs through `runWithPool` at
`AI_SUMMARY_CONCURRENCY` (default 15). Cancellation is checked between
batches (same `isCancelled` callback shape as the pages step).

### Pseudocode

```ts
export async function runSummariesStepSafe(generationId: number): Promise<void> {
  'use step';
  try {
    await markSummariesStatus(generationId, { summariesStatus: 'running' });

    const { generation, site, manifest } = await loadContext(generationId);
    if (!manifest || manifest.results.filter(r => r.status === 'ok').length === 0) {
      return markSummariesStatus(generationId, { summariesStatus: 'skipped' });
    }
    if (!hasGatewayAuth()) {
      return markSummariesStatus(generationId, {
        summariesStatus: 'failed',
        summariesErrorMessage: 'AI Gateway credentials missing',
      });
    }

    const eligible = manifest.results.filter(r => r.status === 'ok');
    const results = await runWithPool(
      eligible,
      page => summarizePage({ generationId, page, siteName: site.name }),
      {
        concurrency: AI_SUMMARY_CONCURRENCY,
        isCancelled: () => readCancelled(generationId),
      },
    );

    const counts = tallyResults(results);
    const manifestPath = await putSummariesManifest(generationId, results);

    if (await readCancelled(generationId)) {
      return markSummariesStatus(generationId, {
        summariesStatus: 'cancelled',
        ...counts,
        summariesManifestBlobPath: manifestPath,
      });
    }

    return markSummariesStatus(generationId, {
      summariesStatus: 'succeeded',
      ...counts,
      summariesManifestBlobPath: manifestPath,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return markSummariesStatus(generationId, {
      summariesStatus: 'failed',
      summariesErrorMessage: message.slice(0, 500),
    });
  }
}
```

## Prompt & schema wiring

A new module `src/lib/workflow/summary-prompt.ts` exports:

- `SUMMARY_SYSTEM_PROMPT` — the verbatim prompt from the user, as a
  template string with `{url}`, `{title}`, `{entity_name}`, and
  `{content}` placeholders. The `{page_type}` line from the user's INPUT
  section is dropped: the model emits `page_type` as output, so it is
  not an input.
- `buildSummaryPrompt({ url, title, entityName, content })` — pure
  placeholder substitution.
- `summarySchema`:
  ```ts
  z.object({
    summary: z.string(),
    page_type: z.enum([
      'homepage', 'service', 'product', 'article',
      'case_study', 'about', 'other',
    ]),
  })
  ```
- `PAGE_TYPES` — same enum array re-exported for use in the frontmatter
  writer and the manifest type.

The per-page helper `src/lib/workflow/summarize-page.ts` does the
read → parse → guard → call → write → return-result work. The model
call:

```ts
const { object } = await generateObject({
  model: 'google/gemini-3.1-flash-lite',
  schema: summarySchema,
  prompt: buildSummaryPrompt({ url, title, entityName, content }),
});
```

`generateObject` retries schema validation failures twice by default
(AI SDK behavior). Beyond that, the per-page error handler counts the
page as failed and moves on.

## Environment variables

Added to `.env.example` and read inside the step:

| Variable | Default | Purpose |
| --- | --- | --- |
| `AI_GATEWAY_API_KEY` | unset | AI Gateway auth in local dev. Production uses Vercel OIDC. |
| `AI_SUMMARY_CONCURRENCY` | `15` | `runWithPool` parallelism for Gemini calls. |
| `AI_SUMMARY_MAX_INPUT_BYTES` | `200000` | Truncation cap for the markdown body sent to the model. |

## Testing

Following the project rule that every module gets a test file alongside
it:

- `src/lib/workflow/summary-prompt.test.ts`
  - Every placeholder is substituted correctly.
  - Missing `title` produces a valid prompt with an empty title field.
  - The full verbatim text from `SUMMARY_SYSTEM_PROMPT` is preserved
    (substring assertions on signature phrases like "Hard cap: 60 words"
    and "[NO_SUMMARY]").
- `src/lib/workflow/frontmatter.test.ts` — extended
  - `parseFrontmatter` round-trips with `buildFrontmatter` for all field
    combinations (title present/absent, summary present/empty,
    page_type present/absent).
  - `buildFrontmatter` writes a `page_type:` line when provided and
    omits it when null/undefined.
- `src/lib/workflow/summarize-page.test.ts` — new
  - Happy path: model returns `{ summary, page_type }`, blob is rewritten
    with both filled in, result is `ok`.
  - `[NO_SUMMARY]` response: blob is rewritten with empty summary and
    `page_type` set, result is `empty`.
  - Body over size cap: gets truncated with the `[truncated]` marker
    before being passed to the model.
  - Model throws after retries: blob is not rewritten, result is
    `failed` with a reason.
  - AI SDK call is mocked at the boundary; no live model traffic.
- `src/lib/workflow/steps.test.ts` — extended
  - `runSummariesStepSafe` happy path: DB transitions `pending` →
    `running` → `succeeded`, counts and manifest path written, manifest
    JSON shape is correct.
  - Mid-loop cancellation sets `summariesStatus = 'cancelled'` with
    partial counts.
  - Manifest is written only when at least one eligible page exists.
  - Missing AI Gateway credentials sets status `failed` with the
    documented error.
  - Upstream `pagesStatus` other than `succeeded` (skipped, failed,
    cancelled) causes the summary step to set
    `summariesStatus = 'skipped'` and skip all work.

## Open Questions / Follow-ups

- Should `notifyStep`'s email body mention the summary count? Low
  priority; can be added in a follow-up after the data is flowing.
- Should the generation detail UI surface per-page `page_type` or
  summary status? Out of scope for this spec; data is in the manifest
  and the blob, ready to be displayed when product wants it.
