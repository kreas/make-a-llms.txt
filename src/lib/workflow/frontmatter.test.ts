import { describe, it, expect } from 'vitest';
import { buildFrontmatter, extractTitle } from './frontmatter';

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
