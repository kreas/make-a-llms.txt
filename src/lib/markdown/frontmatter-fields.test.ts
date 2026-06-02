import { describe, it, expect } from 'vitest';
import { parseFrontmatterFieldsSafe } from './frontmatter-fields';

describe('parseFrontmatterFieldsSafe', () => {
  it('parses --- delimited frontmatter into fields + body', () => {
    const md = '---\ntitle: Hello\nurl: https://x.com\n---\n# Body\ntext';
    const { fields, body } = parseFrontmatterFieldsSafe(md);
    expect(fields.title).toBe('Hello');
    expect(fields.url).toBe('https://x.com');
    expect(body).toBe('# Body\ntext');
  });

  it('falls back to blank-line split when no --- fence', () => {
    const { fields, body } = parseFrontmatterFieldsSafe('title: Hi\n\nBody here');
    expect(fields.title).toBe('Hi');
    expect(body).toBe('Body here');
  });

  it('returns whole string as body when no frontmatter', () => {
    expect(parseFrontmatterFieldsSafe('just text').body).toBe('just text');
  });
});
