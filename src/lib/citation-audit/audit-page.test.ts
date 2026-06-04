import { describe, it, expect } from 'vitest';
import { auditPage } from './audit-page';
import { RUBRIC_WEIGHTS_TOTAL } from './rubric';
import { CHECKS } from './checks';

const HIGH = `<!doctype html><html lang="en">
<head>
  <title>AI Strategy Services — Example Co</title>
  <link rel="canonical" href="https://example.com/services/ai">
  <meta name="description" content="Example Co is a strategy firm helping mid-market companies adopt AI without the hype. Discovery, roadmaps, partnership.">
  <script type="application/ld+json">{"@type":"Service","name":"AI Strategy","provider":{"@type":"Organization","name":"Example Co","sameAs":"https://en.wikipedia.org/wiki/Example_Co"},"dateModified":"${new Date().toISOString()}"}</script>
</head>
<body>
  <h1>AI Strategy Services</h1>
  <article>
    <p>Example Co is a strategy firm helping mid-market companies adopt AI. We run discovery, build roadmaps, and partner long-term with leadership teams across Cleveland, Austin, and Boston.</p>
    <h2>What does this include?</h2>
    <ul><li>Discovery</li><li>Roadmaps</li><li>Partnership</li></ul>
    <h2>How does pricing work?</h2>
    <p>We price per engagement. Most projects run 3-6 months and cost between $40,000 and $120,000.</p>
    <a href="https://example.com/about">About</a>
    <a href="https://example.com/contact">Contact</a>
    <a href="https://example.com/case-studies">Case studies</a>
    <a href="https://en.wikipedia.org/wiki/Artificial_intelligence">Wikipedia: AI</a>
  </article>
</body></html>`;

const LOW = `<html><body><div>nothing</div></body></html>`;

describe('auditPage', () => {
  it('returns one check per rubric entry', async () => {
    const r = await auditPage({ url: 'https://example.com/services/ai', entityName: 'Example Co', html: HIGH, fetchedAt: '2026-05-19T00:00:00Z' });
    expect(r.checks.length).toBe(CHECKS.length);
  });

  it('scores a high-quality page high', async () => {
    const r = await auditPage({ url: 'https://example.com/services/ai', entityName: 'Example Co', html: HIGH, fetchedAt: '2026-05-19T00:00:00Z' });
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(['good', 'excellent']).toContain(r.tier);
  });

  it('scores a stripped-down page low', async () => {
    const r = await auditPage({ url: 'https://example.com/', entityName: 'Example Co', html: LOW, fetchedAt: '2026-05-19T00:00:00Z' });
    expect(r.score).toBeLessThan(50);
    expect(r.tier).toBe('poor');
  });

  it('total of weights equals rubric total', async () => {
    const r = await auditPage({ url: 'https://example.com/', entityName: 'Example Co', html: LOW, fetchedAt: '2026-05-19T00:00:00Z' });
    const sum = r.checks.reduce((a, c) => a + c.weight, 0);
    expect(sum).toBe(RUBRIC_WEIGHTS_TOTAL);
  });

  it('surfaces paragraph-length and section-chunking failures on a wall-of-text page', async () => {
    // One ~480-word paragraph under a single heading: a wall (>130 words) AND an
    // under-chunked section (>400 words). Drives both new checks to fail through
    // the real parse → CHECKS → aggregate pipeline.
    const wall = 'This sentence has exactly eight words in it. '.repeat(60);
    const html = `<!doctype html><html lang="en"><head><title>Long Guide</title></head>` +
      `<body><article><h1>Guide</h1><h2>Overview</h2><p>${wall}</p></article></body></html>`;

    const r = await auditPage({ url: 'https://example.com/guide', entityName: 'Example Co', html, fetchedAt: '2026-05-19T00:00:00Z' });

    const para = r.checks.find((c) => c.id === 'paragraph-length');
    const section = r.checks.find((c) => c.id === 'section-chunking');
    expect(para).toBeDefined();
    expect(para!.passed).toBe(false);
    expect(section).toBeDefined();
    expect(section!.passed).toBe(false);
  });
});
