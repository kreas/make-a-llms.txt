import { describe, it, expect } from 'vitest';
import { buildFrontmatter, extractTitle, parseFrontmatter } from './frontmatter';

describe('extractTitle', () => {
  it('returns the first H1 text', () => {
    expect(extractTitle('# AI Strategy Services\n\nbody')).toBe('AI Strategy Services');
  });

  it('handles multiple H1s by taking the first', () => {
    expect(extractTitle('# First\n\nfoo\n\n# Second')).toBe('First');
  });

  it('collapses inline whitespace', () => {
    expect(extractTitle('#   Multi   Spaced   Title  ')).toBe('Multi Spaced Title');
  });

  it('skips H2 and lower', () => {
    expect(extractTitle('## Subsection\n\n### Sub-sub')).toBeNull();
  });

  it('returns null when no H1 exists', () => {
    expect(extractTitle('plain markdown body, no heading')).toBeNull();
  });

  it('ignores trailing # in ATX-style headers', () => {
    expect(extractTitle('# Title #')).toBe('Title #');
  });
});

describe('buildFrontmatter', () => {
  it('renders all four fields in canonical order', () => {
    const fm = buildFrontmatter({
      title: 'AI Strategy Services',
      url: 'https://civ.co/services/ai-strategy',
      summary: 'Workshops and roadmaps.',
      updated: '2026-05-01',
    });
    expect(fm).toBe(
      'title: AI Strategy Services\n' +
        'url: https://civ.co/services/ai-strategy\n' +
        'summary: Workshops and roadmaps.\n' +
        'updated: 2026-05-01\n\n',
    );
  });

  it('omits the title line when title is null', () => {
    const fm = buildFrontmatter({
      url: 'https://example.test/page',
      updated: '2026-05-14',
      title: null,
    });
    expect(fm).not.toMatch(/^title:/m);
    expect(fm).toMatch(/^url: https:\/\/example\.test\/page$/m);
    expect(fm).toMatch(/^summary: $/m);
    expect(fm).toMatch(/^updated: 2026-05-14$/m);
  });

  it('emits an empty summary line when summary is omitted', () => {
    const fm = buildFrontmatter({
      url: 'https://example.test',
      updated: '2026-05-14',
      title: 'Home',
    });
    expect(fm).toMatch(/^summary: $/m);
  });

  it('ends with a blank line separating frontmatter from the body', () => {
    const fm = buildFrontmatter({
      url: 'https://example.test',
      updated: '2026-05-14',
      title: 'Home',
    });
    expect(fm.endsWith('\n\n')).toBe(true);
  });
});

describe('buildFrontmatter with page_type', () => {
  it('emits a page_type line when provided', () => {
    const fm = buildFrontmatter({
      title: 'Services',
      url: 'https://civ.co/services',
      summary: 'Workshops.',
      updated: '2026-05-14',
      pageType: 'service',
    });
    expect(fm).toMatch(/^page_type: service$/m);
  });

  it('omits the page_type line when not provided', () => {
    const fm = buildFrontmatter({
      title: 'Home',
      url: 'https://civ.co',
      updated: '2026-05-14',
    });
    expect(fm).not.toMatch(/^page_type:/m);
  });

  it('places page_type between summary and updated', () => {
    const fm = buildFrontmatter({
      title: 'Home',
      url: 'https://civ.co',
      summary: 'Acme home page.',
      pageType: 'homepage',
      updated: '2026-05-14',
    });
    const summaryIdx = fm.indexOf('summary:');
    const pageTypeIdx = fm.indexOf('page_type:');
    const updatedIdx = fm.indexOf('updated:');
    expect(summaryIdx).toBeLessThan(pageTypeIdx);
    expect(pageTypeIdx).toBeLessThan(updatedIdx);
  });
});

describe('parseFrontmatter', () => {
  it('separates frontmatter fields from the body', () => {
    const blob =
      'title: Hello\n' +
      'url: https://x.test/p\n' +
      'summary: \n' +
      'updated: 2026-05-14\n\n' +
      '# Hello\n\nBody here.\n';
    const { fields, body } = parseFrontmatter(blob);
    expect(fields.title).toBe('Hello');
    expect(fields.url).toBe('https://x.test/p');
    expect(fields.summary).toBe('');
    expect(fields.updated).toBe('2026-05-14');
    expect(body).toBe('# Hello\n\nBody here.\n');
  });

  it('returns undefined for missing optional fields', () => {
    const blob =
      'url: https://x.test/p\n' +
      'summary: \n' +
      'updated: 2026-05-14\n\n' +
      'body';
    const { fields } = parseFrontmatter(blob);
    expect(fields.title).toBeUndefined();
    expect(fields.pageType).toBeUndefined();
  });

  it('round-trips with buildFrontmatter for all fields', () => {
    const input = {
      title: 'About',
      url: 'https://x.test/about',
      summary: 'A short description.',
      pageType: 'about' as const,
      updated: '2026-05-14',
    };
    const fm = buildFrontmatter(input);
    const { fields, body } = parseFrontmatter(fm + 'body text');
    expect(fields.title).toBe(input.title);
    expect(fields.url).toBe(input.url);
    expect(fields.summary).toBe(input.summary);
    expect(fields.pageType).toBe(input.pageType);
    expect(fields.updated).toBe(input.updated);
    expect(body).toBe('body text');
  });

  it('throws when the blob has no frontmatter terminator', () => {
    expect(() => parseFrontmatter('no frontmatter here')).toThrow(
      /frontmatter/i,
    );
  });
});
