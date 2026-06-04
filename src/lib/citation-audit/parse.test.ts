import { describe, it, expect } from 'vitest';
import { parsePage } from './parse';

const FIXTURE_HTML = `<!doctype html>
<html><head>
  <title>AI Strategy Services — Example Co</title>
  <link rel="canonical" href="https://example.com/services/ai" />
  <meta name="description" content="Example Co builds practical AI strategy for mid-market companies.">
  <meta property="og:title" content="AI Strategy Services">
  <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Service","name":"AI Strategy","provider":{"@type":"Organization","name":"Example Co"}}
  </script>
</head>
<body>
  <h1>AI Strategy Services</h1>
  <p>Example Co helps mid-market companies adopt AI without the hype.</p>
  <h2>What does this include?</h2>
  <ul><li>Discovery workshops</li><li>Roadmaps</li></ul>
  <a href="https://example.com/about">About us</a>
  <a href="https://google.com">External</a>
</body></html>`;

describe('parsePage', () => {
  it('extracts title, canonical, meta description, headings, links, and json-ld', () => {
    const parsed = parsePage('https://example.com/services/ai', FIXTURE_HTML);
    expect(parsed.title).toBe('AI Strategy Services — Example Co');
    expect(parsed.canonical).toBe('https://example.com/services/ai');
    expect(parsed.metaDescription).toMatch(/practical AI strategy/);
    expect(parsed.headings.filter((h) => h.level === 1).length).toBe(1);
    expect(parsed.headings.some((h) => h.level === 2 && h.text.includes('?'))).toBe(true);
    expect(parsed.jsonLd.length).toBe(1);
    expect((parsed.jsonLd[0] as { '@type': string })['@type']).toBe('Service');
    expect(parsed.links.some((l) => l.isInternal && l.href.includes('/about'))).toBe(true);
    expect(parsed.links.some((l) => !l.isInternal && l.href.includes('google.com'))).toBe(true);
    expect(parsed.article?.textContent.length).toBeGreaterThan(0);
  });

  it('handles HTML with no head tags gracefully', () => {
    const parsed = parsePage('https://example.com/x', '<html><body><p>hi</p></body></html>');
    expect(parsed.title).toBeNull();
    expect(parsed.canonical).toBeNull();
    expect(parsed.headings.length).toBe(0);
  });

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
});
