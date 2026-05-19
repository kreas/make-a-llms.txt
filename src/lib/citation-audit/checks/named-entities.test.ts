import { describe, it, expect } from 'vitest';
import { parsePage } from '../parse';
import { check } from './named-entities';

const disambiguated = `<html><body>
<p>Example Co works with Google and Microsoft in San Francisco.</p>
<script type="application/ld+json">{"@type":"Organization","name":"Example Co","sameAs":"https://en.wikipedia.org/wiki/Example_Co"}</script>
</body></html>`;

const undisambiguated = '<html><body><p>Example Co works with Acme and Foo Bar in Cleveland.</p></body></html>';
const few = '<html><body><p>We help companies do things.</p></body></html>';

describe('named-entities', () => {
  it('100 when entities + disambiguation', () => {
    const r = check(parsePage('https://x', disambiguated), { entityName: 'Example Co' });
    expect(r.score).toBe(100);
  });
  it('60 when entities but no disambiguation', () => {
    const r = check(parsePage('https://x', undisambiguated), { entityName: 'Example Co' });
    expect(r.score).toBe(60);
  });
  it('0 with too few entities', () => {
    expect(check(parsePage('https://x', few), { entityName: 'Example Co' }).score).toBe(0);
  });
});
