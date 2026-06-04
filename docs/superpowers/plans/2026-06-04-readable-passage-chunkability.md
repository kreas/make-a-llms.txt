# Readable Passage Chunkability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two deterministic, page-level Readable-pillar checks (`paragraph-length`, `section-chunking`) to the `citation-audit` engine that score how cleanly a page's content splits into retrieval-sized passages.

**Architecture:** Pre-compute `paragraphs` and `sections` on `ParsedPage` in `parse.ts` (from the Readability-cleaned article DOM, falling back to the full document). Two new pure `CheckModule`s consume those fields. Register them in the checks index, rubric, and pillar map; everything downstream (per-page score, pillar rollup, accordion UI) is automatic.

**Tech Stack:** TypeScript, Vitest, linkedom (`parseHTML`), `@mozilla/readability`.

**Spec:** `docs/superpowers/specs/2026-06-04-readable-passage-chunkability-design.md`

---

## File Structure

- `src/lib/citation-audit/text.ts` *(new)* — shared text helpers: `countWords`, `extractParagraphs`, `extractSections`. Pure, DOM-in / data-out.
- `src/lib/citation-audit/types.ts` *(modify)* — add `paragraphs` and `sections` to `ParsedPage`.
- `src/lib/citation-audit/parse.ts` *(modify)* — populate the two new fields using `text.ts` helpers and the Readability-cleaned DOM.
- `src/lib/citation-audit/checks/paragraph-length.ts` *(new)* — wall-of-text check.
- `src/lib/citation-audit/checks/section-chunking.ts` *(new)* — under-chunked-section check.
- `src/lib/citation-audit/checks/index.ts` *(modify)* — register both modules.
- `src/lib/citation-audit/rubric.ts` *(modify)* — two weight-5 entries.
- `src/lib/citation-audit/pillars.ts` *(modify)* — map both ids → `readable`.
- `src/components/citations/citations-page-detail.tsx` *(modify)* — two `CHECK_LABEL` entries.
- Test updates: `rubric.test.ts` (15→17, 100→110), `pillars.test.ts` (55→65).

---

### Task 1: Shared text helpers (`text.ts`)

**Files:**
- Create: `src/lib/citation-audit/text.ts`
- Test: `src/lib/citation-audit/text.test.ts`

These helpers do the structural work both checks rely on. `extractSections` walks the DOM depth-first (document order); each heading (`h1`–`h6`) opens a new section, text nodes accumulate word counts into the current section, and the heading's own text is **not** counted as body. Content before the first heading becomes a `heading: null` section. Zero-word sections are dropped so they don't dilute ratios. `extractParagraphs` returns the trimmed text of every non-empty `<p>`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/citation-audit/text.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import { countWords, extractParagraphs, extractSections } from './text';

function bodyOf(html: string) {
  const { document } = parseHTML(html);
  return document.body as unknown as Element;
}

describe('countWords', () => {
  it('counts whitespace-separated tokens', () => {
    expect(countWords('one two   three\nfour')).toBe(4);
  });
  it('returns 0 for empty / whitespace', () => {
    expect(countWords('   ')).toBe(0);
    expect(countWords('')).toBe(0);
  });
});

describe('extractParagraphs', () => {
  it('returns trimmed text of each non-empty <p>', () => {
    const root = bodyOf('<body><p>  First para.  </p><p></p><p>Second.</p></body>');
    expect(extractParagraphs(root)).toEqual(['First para.', 'Second.']);
  });
  it('finds paragraphs nested inside wrappers', () => {
    const root = bodyOf('<body><article><div><p>Nested.</p></div></article></body>');
    expect(extractParagraphs(root)).toEqual(['Nested.']);
  });
});

describe('extractSections', () => {
  it('splits content at headings in document order, excluding heading text from word counts', () => {
    const root = bodyOf(
      '<body><p>Intro words here now.</p>' +
        '<h2>Section One</h2><p>Alpha beta gamma.</p>' +
        '<h3>Sub</h3><p>Delta epsilon.</p></body>',
    );
    const sections = extractSections(root);
    expect(sections).toEqual([
      { level: null, heading: null, wordCount: 4 },
      { level: 2, heading: 'Section One', wordCount: 3 },
      { level: 3, heading: 'Sub', wordCount: 2 },
    ]);
  });
  it('finds headings nested inside wrappers (full DOM walk)', () => {
    const root = bodyOf(
      '<body><div><h2>Wrapped</h2></div><section><p>One two three.</p></section></body>',
    );
    expect(extractSections(root)).toEqual([
      { level: 2, heading: 'Wrapped', wordCount: 3 },
    ]);
  });
  it('treats a page with no headings as one null-heading section', () => {
    const root = bodyOf('<body><p>Just one two three four.</p></body>');
    expect(extractSections(root)).toEqual([
      { level: null, heading: null, wordCount: 5 },
    ]);
  });
  it('drops zero-word sections (e.g. adjacent headings)', () => {
    const root = bodyOf('<body><h2>Empty</h2><h2>Real</h2><p>Has words.</p></body>');
    expect(extractSections(root)).toEqual([
      { level: 2, heading: 'Real', wordCount: 2 },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/citation-audit/text.test.ts`
Expected: FAIL — `Failed to resolve import "./text"` / functions not defined.

- [ ] **Step 3: Implement `text.ts`**

Create `src/lib/citation-audit/text.ts`:

```ts
export type Section = {
  level: number | null;
  heading: string | null;
  wordCount: number;
};

/** Count whitespace-separated word tokens. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed === '') return 0;
  return trimmed.split(/\s+/).length;
}

const HEADING_RE = /^h[1-6]$/;

/** Trimmed text of every non-empty <p> under `root`, in document order. */
export function extractParagraphs(root: Element): string[] {
  return Array.from(root.querySelectorAll('p'))
    .map((p) => (p.textContent ?? '').trim())
    .filter((t) => t.length > 0);
}

/**
 * Split `root` into sections delimited by headings (depth-first, document order).
 * Each heading opens a new section; text nodes add to the current section's word
 * count; a heading's own text is the section label, not body. Content before the
 * first heading is a `heading: null` section. Zero-word sections are dropped.
 */
export function extractSections(root: Element): Section[] {
  const sections: Section[] = [{ level: null, heading: null, wordCount: 0 }];
  let current = sections[0];

  function walk(node: Node): void {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 1) {
        const el = child as Element;
        const tag = el.tagName.toLowerCase();
        if (HEADING_RE.test(tag)) {
          current = {
            level: Number(tag[1]),
            heading: (el.textContent ?? '').trim() || null,
            wordCount: 0,
          };
          sections.push(current);
        } else {
          walk(el);
        }
      } else if (child.nodeType === 3) {
        current.wordCount += countWords(child.textContent ?? '');
      }
    }
  }

  walk(root);
  return sections.filter((s) => s.wordCount > 0);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/citation-audit/text.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/citation-audit/text.ts src/lib/citation-audit/text.test.ts
git commit -m "feat: add citation-audit text helpers (countWords, paragraphs, sections)"
```

---

### Task 2: Add `paragraphs` and `sections` to `ParsedPage`

**Files:**
- Modify: `src/lib/citation-audit/types.ts:38-58` (the `ParsedPage` type)
- Modify: `src/lib/citation-audit/parse.ts`
- Test: `src/lib/citation-audit/parse.test.ts`

Populate the new fields from the **Readability-cleaned article DOM** when available (re-parsing `r.content`), falling back to the full document body. This keeps nav/footer boilerplate out of the chunkability measurement.

- [ ] **Step 1: Add the fields to the type**

In `src/lib/citation-audit/types.ts`, import the `Section` type and extend `ParsedPage`. Add at the top of the file:

```ts
import type { Section } from './text';
```

Then inside the `ParsedPage` type, after the `links: { ... }[];` field, add:

```ts
  paragraphs: string[];
  sections: Section[];
```

- [ ] **Step 2: Write the failing parse test**

Append these cases to `src/lib/citation-audit/parse.test.ts` inside the existing `describe('parsePage', ...)`:

```ts
  it('extracts paragraphs and heading-delimited sections', () => {
    const html =
      '<html><body>' +
      '<h1>Title</h1>' +
      '<p>First paragraph has five words.</p>' +
      '<h2>Details</h2>' +
      '<p>Second paragraph here.</p>' +
      '</body></html>';
    const parsed = parsePage('https://example.com/x', html);
    expect(parsed.paragraphs).toEqual([
      'First paragraph has five words.',
      'Second paragraph here.',
    ]);
    // One section per heading; heading text excluded from word counts.
    expect(parsed.sections.map((s) => s.heading)).toEqual(['Title', 'Details']);
    expect(parsed.sections[0].wordCount).toBe(5);
    expect(parsed.sections[1].wordCount).toBe(3);
  });

  it('returns empty paragraphs/sections for an empty body', () => {
    const parsed = parsePage('https://example.com/x', '<html><body></body></html>');
    expect(parsed.paragraphs).toEqual([]);
    expect(parsed.sections).toEqual([]);
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test src/lib/citation-audit/parse.test.ts`
Expected: FAIL — `parsed.paragraphs` is `undefined`.

- [ ] **Step 4: Wire the fields into `parse.ts`**

In `src/lib/citation-audit/parse.ts`, add the import near the top (after the existing imports):

```ts
import { extractParagraphs, extractSections } from './text';
```

Replace the Readability block (currently lines ~60-75, the `let article ... } catch { article = null; }`) with a version that also captures the cleaned content root:

```ts
  let article: ParsedPage['article'] = null;
  let contentRoot: Element = document.body as unknown as Element;
  try {
    const { document: cloneDoc } = parseHTML(html);
    const reader = new Readability(cloneDoc as unknown as Document);
    const r = reader.parse();
    if (r) {
      const textContent = r.textContent ?? '';
      article = {
        title: r.title ?? null,
        textContent: textContent.trim(),
        lengthChars: textContent.length,
      };
      if (r.content) {
        const { document: artDoc } = parseHTML(r.content);
        if (artDoc.body) contentRoot = artDoc.body as unknown as Element;
      }
    }
  } catch {
    article = null;
  }

  const paragraphs = extractParagraphs(contentRoot);
  const sections = extractSections(contentRoot);
```

Then in the returned object, add the two fields (after `links,`):

```ts
    paragraphs,
    sections,
```

Note: `document.body` can be null for fragments; if so `contentRoot` is null-ish and `extractParagraphs`/`extractSections` must tolerate it. Guard at the call site by defaulting:

```ts
  const root = contentRoot ?? (document as unknown as Element);
  const paragraphs = extractParagraphs(root);
  const sections = extractSections(root);
```

Use this guarded form (replace the two unguarded lines above with these three).

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test src/lib/citation-audit/parse.test.ts`
Expected: PASS (including the pre-existing cases).

- [ ] **Step 6: Commit**

```bash
git add src/lib/citation-audit/types.ts src/lib/citation-audit/parse.ts src/lib/citation-audit/parse.test.ts
git commit -m "feat: pre-compute paragraphs and sections on ParsedPage"
```

---

### Task 3: `paragraph-length` check

**Files:**
- Create: `src/lib/citation-audit/checks/paragraph-length.ts`
- Test: `src/lib/citation-audit/checks/paragraph-length.test.ts`

Penalizes walls of text. A paragraph over `LONG_PARAGRAPH_WORDS` (130) is a "wall"; the check passes when no more than 15% of paragraphs are walls. Score degrades linearly with the wall fraction. Zero paragraphs → pass/100 (nothing to penalize; thin content is a separate, deferred signal).

- [ ] **Step 1: Write the failing test**

Create `src/lib/citation-audit/checks/paragraph-length.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { check } from './paragraph-length';
import type { ParsedPage } from '../types';

const word = 'lorem';
function para(n: number): string {
  return Array(n).fill(word).join(' ');
}
function pageWith(paragraphs: string[]): ParsedPage {
  return { paragraphs, sections: [] } as unknown as ParsedPage;
}

describe('paragraph-length', () => {
  it('passes with full score when all paragraphs are short', () => {
    const r = check(pageWith([para(40), para(80), para(120)]), { entityName: 'X' });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(100);
  });

  it('passes/100 with no paragraphs', () => {
    const r = check(pageWith([]), { entityName: 'X' });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(100);
    expect(r.evidence[0]).toMatch(/no prose paragraphs/i);
  });

  it('gives graduated credit when a quarter are walls', () => {
    // 1 of 4 over 130 → longFraction 0.25 → 100 - 50 = 50; passed=false (>15%)
    const r = check(pageWith([para(200), para(40), para(40), para(40)]), { entityName: 'X' });
    expect(r.passed).toBe(false);
    expect(r.score).toBe(50);
    expect(r.evidence[0]).toMatch(/1 of 4 paragraphs exceed 130 words/);
    expect(r.recommendation).toMatch(/Break up long paragraphs/);
  });

  it('passes when walls are within the 15% tolerance', () => {
    // 1 of 10 → 0.10 ≤ 0.15 → passed; score 100 - 20 = 80
    const paras = [para(200), ...Array(9).fill(para(40))];
    const r = check(pageWith(paras), { entityName: 'X' });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(80);
  });

  it('scores 0 when half or more are walls', () => {
    const r = check(pageWith([para(200), para(200), para(40), para(40)]), { entityName: 'X' });
    expect(r.score).toBe(0);
    expect(r.passed).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/citation-audit/checks/paragraph-length.test.ts`
Expected: FAIL — cannot resolve `./paragraph-length`.

- [ ] **Step 3: Implement the check**

Create `src/lib/citation-audit/checks/paragraph-length.ts`:

```ts
import type { CheckResult, ParsedPage, CheckContext } from '../types';
import { countWords } from '../text';

export const ID = 'paragraph-length';
export const WEIGHT = 5;

export const LONG_PARAGRAPH_WORDS = 130;
export const WALL_FRACTION_PASS = 0.15;

export function check(parsed: ParsedPage, _ctx: CheckContext): CheckResult {
  const counts = parsed.paragraphs.map(countWords);
  const total = counts.length;

  if (total === 0) {
    return {
      id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: ['No prose paragraphs to evaluate.'],
      recommendation: null,
    };
  }

  const longCounts = counts.filter((n) => n > LONG_PARAGRAPH_WORDS);
  const longFraction = longCounts.length / total;
  const score = Math.max(0, Math.min(100, Math.round(100 - longFraction * 200)));
  const passed = longFraction <= WALL_FRACTION_PASS;

  if (passed && longCounts.length === 0) {
    return {
      id: ID, weight: WEIGHT, passed: true, score,
      evidence: [`All ${total} paragraphs are within ${LONG_PARAGRAPH_WORDS} words.`],
      recommendation: null,
    };
  }

  const longest = Math.max(...counts);
  return {
    id: ID, weight: WEIGHT, passed, score,
    evidence: [`${longCounts.length} of ${total} paragraphs exceed ${LONG_PARAGRAPH_WORDS} words (longest: ${longest}).`],
    recommendation: passed
      ? null
      : 'Break up long paragraphs (over 130 words) into shorter, self-contained passages so AI models can extract and cite them cleanly.',
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/citation-audit/checks/paragraph-length.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/citation-audit/checks/paragraph-length.ts src/lib/citation-audit/checks/paragraph-length.test.ts
git commit -m "feat: add paragraph-length readable check"
```

---

### Task 4: `section-chunking` check

**Files:**
- Create: `src/lib/citation-audit/checks/section-chunking.ts`
- Test: `src/lib/citation-audit/checks/section-chunking.test.ts`

Rewards content broken into retrieval-sized spans. A section over `LONG_SECTION_WORDS` (400) is under-chunked; the check fails if **any** section exceeds it (stricter than paragraphs by design). Score degrades with the over-long fraction. Pages with less than `SHORT_PAGE_WORDS` (400) of total body text pass — nothing to chunk.

- [ ] **Step 1: Write the failing test**

Create `src/lib/citation-audit/checks/section-chunking.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { check } from './section-chunking';
import type { ParsedPage, Section } from '../types';

function pageWith(sections: Section[]): ParsedPage {
  return { paragraphs: [], sections } as unknown as ParsedPage;
}

describe('section-chunking', () => {
  it('passes/100 when every section is retrieval-sized', () => {
    const r = check(
      pageWith([
        { level: 2, heading: 'A', wordCount: 250 },
        { level: 2, heading: 'B', wordCount: 300 },
      ]),
      { entityName: 'X' },
    );
    expect(r.passed).toBe(true);
    expect(r.score).toBe(100);
  });

  it('passes/100 for a short page even with one section', () => {
    const r = check(pageWith([{ level: null, heading: null, wordCount: 350 }]), { entityName: 'X' });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(100);
    expect(r.evidence[0]).toMatch(/short enough to chunk/i);
  });

  it('fails when a section exceeds 400 words', () => {
    // 1 of 3 over → longFraction 1/3 → 100 - 66.67*2 ... round(100 - 0.333*200)=33
    const r = check(
      pageWith([
        { level: 2, heading: 'Intro', wordCount: 200 },
        { level: 2, heading: 'Our Process', wordCount: 520 },
        { level: 2, heading: 'Pricing', wordCount: 150 },
      ]),
      { entityName: 'X' },
    );
    expect(r.passed).toBe(false);
    expect(r.score).toBe(33);
    expect(r.evidence[0]).toMatch(/1 section.* exceed 400 words/);
    expect(r.evidence[0]).toMatch(/Our Process/);
    expect(r.recommendation).toMatch(/Add subheadings/);
  });

  it('fails hard for one giant no-heading blob', () => {
    const r = check(pageWith([{ level: null, heading: null, wordCount: 900 }]), { entityName: 'X' });
    expect(r.passed).toBe(false);
    expect(r.score).toBe(0);
    expect(r.evidence[0]).toMatch(/intro \/ no heading/i);
  });

  it('passes/100 when there are no sections at all', () => {
    const r = check(pageWith([]), { entityName: 'X' });
    expect(r.passed).toBe(true);
    expect(r.score).toBe(100);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/citation-audit/checks/section-chunking.test.ts`
Expected: FAIL — cannot resolve `./section-chunking`.

- [ ] **Step 3: Implement the check**

Create `src/lib/citation-audit/checks/section-chunking.ts`:

```ts
import type { CheckResult, ParsedPage, CheckContext, Section } from '../types';

export const ID = 'section-chunking';
export const WEIGHT = 5;

export const LONG_SECTION_WORDS = 400;
export const SHORT_PAGE_WORDS = 400;

function label(s: Section): string {
  return s.heading ?? 'intro / no heading';
}

export function check(parsed: ParsedPage, _ctx: CheckContext): CheckResult {
  const sections = parsed.sections;
  const total = sections.length;

  if (total === 0) {
    return {
      id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: ['No body content to chunk.'],
      recommendation: null,
    };
  }

  const totalWords = sections.reduce((a, s) => a + s.wordCount, 0);
  if (totalWords < SHORT_PAGE_WORDS) {
    return {
      id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: ['Page is short enough to chunk cleanly.'],
      recommendation: null,
    };
  }

  const longSections = sections.filter((s) => s.wordCount > LONG_SECTION_WORDS);
  const longFraction = longSections.length / total;
  const score = Math.max(0, Math.min(100, Math.round(100 - longFraction * 200)));
  const passed = longSections.length === 0;

  if (passed) {
    return {
      id: ID, weight: WEIGHT, passed: true, score: 100,
      evidence: [`All ${total} sections are within ${LONG_SECTION_WORDS} words.`],
      recommendation: null,
    };
  }

  const largest = longSections.reduce((a, s) => (s.wordCount > a.wordCount ? s : a));
  return {
    id: ID, weight: WEIGHT, passed: false, score,
    evidence: [
      `${longSections.length} section${longSections.length === 1 ? '' : 's'} exceed ${LONG_SECTION_WORDS} words without a subheading (largest: "${label(largest)}" — ${largest.wordCount} words).`,
    ],
    recommendation: 'Add subheadings to break long sections (over 400 words) into retrieval-sized chunks AI models can pull from.',
  };
}
```

Also export the `Section` type from `types.ts` so the check and its test can import it. In `src/lib/citation-audit/types.ts`, change the existing `import type { Section } from './text';` (added in Task 2) to also re-export it — add this line near the other exported types:

```ts
export type { Section } from './text';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test src/lib/citation-audit/checks/section-chunking.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/citation-audit/checks/section-chunking.ts src/lib/citation-audit/checks/section-chunking.test.ts src/lib/citation-audit/types.ts
git commit -m "feat: add section-chunking readable check"
```

---

### Task 5: Register checks in the engine (index, rubric, pillars)

**Files:**
- Modify: `src/lib/citation-audit/checks/index.ts`
- Modify: `src/lib/citation-audit/rubric.ts:5-21`
- Modify: `src/lib/citation-audit/pillars.ts:9-28`
- Modify: `src/lib/citation-audit/rubric.test.ts:5-18`
- Modify: `src/lib/citation-audit/pillars.test.ts:21`

Wiring the modules in makes them run, score, and bucket into the readable pillar. The engine normalizes by present weights, so no rebalance — only the count/total assertions move (15→17, 100→110, readable 55→65).

- [ ] **Step 1: Update the engine-shape test assertions first (TDD red)**

In `src/lib/citation-audit/rubric.test.ts`, change line 6:

```ts
    expect(RUBRIC.length).toBe(17);
```

and the weights-total block (lines ~14-18):

```ts
  it('weights total 110', () => {
    const sum = RUBRIC.reduce((acc, r) => acc + r.weight, 0);
    expect(sum).toBe(110);
    expect(RUBRIC_WEIGHTS_TOTAL).toBe(110);
  });
```

In `src/lib/citation-audit/pillars.test.ts`, change the readable subtotal (line ~21) and its comment:

```ts
  it('pillar weight subtotals match the spec (65 / 5 / 40)', () => {
    const sum = (p: string) =>
      RUBRIC.filter((r) => PILLAR_OF[r.id] === p).reduce((a, r) => a + r.weight, 0);
    expect(sum('readable')).toBe(65);
    expect(sum('recommendable')).toBe(5);
    expect(sum('recognized')).toBe(40);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/lib/citation-audit/rubric.test.ts src/lib/citation-audit/pillars.test.ts`
Expected: FAIL — `RUBRIC.length` is 15, sum is 100, readable is 55.

- [ ] **Step 3: Register in `checks/index.ts`**

In `src/lib/citation-audit/checks/index.ts`, add two imports after the existing ones (after the `internalLinks` import):

```ts
import * as paragraphLength from './paragraph-length';
import * as sectionChunking from './section-chunking';
```

and append them to the `CHECKS` array (after `internalLinks,`):

```ts
  paragraphLength, sectionChunking,
```

- [ ] **Step 4: Add rubric weights**

In `src/lib/citation-audit/rubric.ts`, add two entries to the `RUBRIC` array (after the `{ id: 'internal-links', weight: 5 }` entry):

```ts
  { id: 'paragraph-length', weight: 5 },
  { id: 'section-chunking', weight: 5 },
```

- [ ] **Step 5: Map to the readable pillar**

In `src/lib/citation-audit/pillars.ts`, add two entries to the `PILLAR_OF` map, inside the `// Readable (AEO)` group (after `'internal-links': 'readable',`):

```ts
  'paragraph-length': 'readable',
  'section-chunking': 'readable',
```

- [ ] **Step 6: Run the engine tests to verify they pass**

Run: `pnpm test src/lib/citation-audit/rubric.test.ts src/lib/citation-audit/pillars.test.ts src/lib/citation-audit/audit-page.test.ts`
Expected: PASS — `audit-page.test.ts` (`r.checks.length === CHECKS.length`) tracks `CHECKS` automatically.

- [ ] **Step 7: Commit**

```bash
git add src/lib/citation-audit/checks/index.ts src/lib/citation-audit/rubric.ts src/lib/citation-audit/pillars.ts src/lib/citation-audit/rubric.test.ts src/lib/citation-audit/pillars.test.ts
git commit -m "feat: register paragraph-length and section-chunking in readable pillar"
```

---

### Task 6: UI labels for the new checks

**Files:**
- Modify: `src/components/citations/citations-page-detail.tsx:17-32` (the `CHECK_LABEL` map)

The accordion renders each check via the `CHECK_LABEL` lookup. Without an entry a check would display its raw id. Add friendly labels.

- [ ] **Step 1: Add the labels**

In `src/components/citations/citations-page-detail.tsx`, add two entries to the `CHECK_LABEL` object (after `'internal-links': 'Internal links to related pages',`):

```ts
  'paragraph-length': 'Paragraphs are passage-sized',
  'section-chunking': 'Sections are well-chunked',
```

- [ ] **Step 2: Run the component test to confirm no regression**

Run: `pnpm test src/components/citations/citations-page-detail.test.tsx`
Expected: PASS (the test asserts score/button behavior, not the label map — adding labels is safe).

- [ ] **Step 3: Commit**

```bash
git add src/components/citations/citations-page-detail.tsx
git commit -m "feat: label paragraph-length and section-chunking checks in the audit UI"
```

---

### Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the entire test suite**

Run: `pnpm test`
Expected: PASS — all suites green, including any `site-readiness` / `run` suites (these use synthetic `CheckResult`s, not the live rubric, so they are unaffected by the new checks). If a count/total assertion elsewhere fails, update it to the new values (17 checks / 110 total / readable 65) and re-run.

- [ ] **Step 2: Type-check and build**

Run: `pnpm build`
Expected: Compiles with no TypeScript errors.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: No new lint errors in the touched files.

- [ ] **Step 4: Commit any verification fixes**

```bash
git add -A
git commit -m "test: align citation-audit assertions with new readable checks"
```

(Skip if Steps 1-3 produced no changes.)

---

## Self-Review

**1. Spec coverage:**
- Two deterministic checks (`paragraph-length`, `section-chunking`) → Tasks 3, 4. ✓
- `ParsedPage.paragraphs` / `.sections` from Readability DOM with document fallback → Task 2. ✓
- Section extraction excludes heading text, lead-content `null` section, drops zero-word spans → Task 1 helper + tests. ✓
- Thresholds 130 / 400 / 0.15 / short-page 400 as named constants → Tasks 3, 4. ✓
- Graduated scoring + paragraph-vs-section strictness difference → Tasks 3, 4. ✓
- Weights 5/5, totals 55→65 / 100→110 / 8→10 checks → Task 5. ✓
- Registry/rubric/pillar wiring → Task 5. ✓
- UI `CHECK_LABEL` entries → Task 6. ✓
- Engine test updates (`rubric`, `pillars`) → Task 5; full suite → Task 7. ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows complete code. ✓

**3. Type consistency:** `Section` defined once in `text.ts` (Task 1), imported into `types.ts` and re-exported (Tasks 2, 4); checks import `countWords`/`Section` from the same modules; `ID`/`WEIGHT`/`check` signatures match the existing `CheckModule` shape; constants (`LONG_PARAGRAPH_WORDS`, `LONG_SECTION_WORDS`, `SHORT_PAGE_WORDS`, `WALL_FRACTION_PASS`) match the spec. ✓
