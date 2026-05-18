import { describe, it, expect } from 'vitest';
import {
  buildSummaryPrompt,
  SUMMARY_SYSTEM_PROMPT,
  PAGE_TYPES,
  summarySchema,
} from './summary-prompt';

describe('SUMMARY_SYSTEM_PROMPT', () => {
  it('preserves the signature instructions from the spec', () => {
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/Hard cap: 60 words/);
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/\[NO_SUMMARY\]/);
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/Third person only/);
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/Forbidden Punctuation/i);
  });

  it('does not include a {page_type} input placeholder', () => {
    // page_type is an OUTPUT, not an input — the model classifies the page.
    expect(SUMMARY_SYSTEM_PROMPT).not.toMatch(/\{page_type\}/);
  });

  it('exposes the four input placeholders the builder substitutes', () => {
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/\{url\}/);
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/\{title\}/);
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/\{entity_name\}/);
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/\{content\}/);
  });
});

describe('buildSummaryPrompt', () => {
  it('substitutes every placeholder exactly once', () => {
    const out = buildSummaryPrompt({
      url: 'https://example.test/about',
      title: 'About Acme',
      entityName: 'Acme',
      content: '# About Acme\n\nMarkdown body.',
    });
    expect(out).toContain('https://example.test/about');
    expect(out).toContain('About Acme');
    expect(out).toContain('Acme');
    expect(out).toContain('# About Acme\n\nMarkdown body.');
    expect(out).not.toMatch(/\{url\}|\{title\}|\{entity_name\}|\{content\}/);
  });

  it('renders an empty title field without breaking the prompt', () => {
    const out = buildSummaryPrompt({
      url: 'https://x.test/p',
      title: '',
      entityName: 'X',
      content: 'body',
    });
    expect(out).toMatch(/Page title:\s*$/m);
    expect(out).not.toMatch(/\{title\}/);
  });
});

describe('PAGE_TYPES and summarySchema', () => {
  it('declares the seven allowed page types', () => {
    expect(PAGE_TYPES).toEqual([
      'homepage', 'service', 'product', 'article',
      'case_study', 'about', 'other',
    ]);
  });

  it('validates a well-formed model response', () => {
    const parsed = summarySchema.safeParse({
      summary: 'Two sentences. They describe what the page is about.',
      page_type: 'service',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown page_type', () => {
    const parsed = summarySchema.safeParse({
      summary: 's',
      page_type: 'landing',
    });
    expect(parsed.success).toBe(false);
  });
});
