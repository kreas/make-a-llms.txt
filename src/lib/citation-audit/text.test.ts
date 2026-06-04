import { describe, it, expect } from 'vitest';
import { parseHTML } from 'linkedom';
import { countWords, extractParagraphs, extractSections } from './text';

function bodyOf(html: string) {
  // Wrap in a full document so linkedom's document.body resolves correctly;
  // passing a bare <body>...</body> fragment causes linkedom to emit a nested
  // structure where document.body is the inner (empty) body element.
  const wrapped = html.startsWith('<!') ? html : `<!doctype html><html>${html}</html>`;
  const { document } = parseHTML(wrapped);
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
