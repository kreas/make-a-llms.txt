import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { parseRobotsTxt, evaluateBot } from './robots-parser';
import { KNOWN_AI_BOTS } from './known-ai-bots';

function fixture(name: string): string {
  return readFileSync(join(__dirname, '__fixtures__/robots', name), 'utf8');
}

describe('parseRobotsTxt + evaluateBot', () => {
  it('empty file: every known bot is default', () => {
    const groups = parseRobotsTxt(fixture('empty.txt'));
    for (const bot of KNOWN_AI_BOTS) {
      expect(evaluateBot(groups, bot)).toEqual({ status: 'default' });
    }
  });

  it('block-all-ai: every known bot is blocked', () => {
    const groups = parseRobotsTxt(fixture('block-all-ai.txt'));
    for (const bot of KNOWN_AI_BOTS) {
      expect(evaluateBot(groups, bot)).toEqual({ status: 'blocked' });
    }
  });

  it('allow-all-wildcard: every known bot is default (wildcard is not an explicit decision)', () => {
    const groups = parseRobotsTxt(fixture('allow-all-wildcard.txt'));
    for (const bot of KNOWN_AI_BOTS) {
      expect(evaluateBot(groups, bot)).toEqual({ status: 'default' });
    }
  });

  it('mixed: per-bot statuses follow the explicit groups', () => {
    const groups = parseRobotsTxt(fixture('mixed.txt'));
    expect(evaluateBot(groups, 'GPTBot')).toEqual({ status: 'blocked' });
    expect(evaluateBot(groups, 'ClaudeBot')).toEqual({ status: 'allowed' });
    expect(evaluateBot(groups, 'CCBot')).toEqual({
      status: 'partial',
      disallowedPaths: ['/private'],
    });
    expect(evaluateBot(groups, 'PerplexityBot')).toEqual({ status: 'default' });
  });

  it('partial-paths: status is partial with disallowedPaths populated', () => {
    const groups = parseRobotsTxt(fixture('partial-paths.txt'));
    expect(evaluateBot(groups, 'GPTBot')).toEqual({
      status: 'partial',
      disallowedPaths: ['/admin', '/internal'],
    });
  });

  it('wildcard-paths: status is partial; wildcard pattern is preserved verbatim', () => {
    const groups = parseRobotsTxt(fixture('wildcard-paths.txt'));
    expect(evaluateBot(groups, 'GPTBot')).toEqual({
      status: 'partial',
      disallowedPaths: ['/*.json'],
    });
  });

  it('allow-overrides-disallow: Allow: / on root makes the bot allowed despite Disallow: /', () => {
    const groups = parseRobotsTxt(fixture('allow-overrides-disallow.txt'));
    expect(evaluateBot(groups, 'GPTBot')).toEqual({ status: 'allowed' });
  });

  it('malformed: silently skips bad lines, parses ClaudeBot group correctly', () => {
    const groups = parseRobotsTxt(fixture('malformed.txt'));
    expect(evaluateBot(groups, 'ClaudeBot')).toEqual({ status: 'blocked' });
    expect(evaluateBot(groups, 'GPTBot')).toEqual({ status: 'default' });
  });

  it('UA match is case-insensitive', () => {
    const groups = parseRobotsTxt('User-agent: gptbot\nDisallow: /');
    expect(evaluateBot(groups, 'GPTBot')).toEqual({ status: 'blocked' });
  });

  it('longest UA match wins when multiple specific groups exist', () => {
    const groups = parseRobotsTxt(
      [
        'User-agent: Claude',
        'Disallow: /',
        '',
        'User-agent: Claude-Web',
        'Allow: /',
      ].join('\n'),
    );
    // Claude-Web is longer than Claude, so Claude-Web wins.
    expect(evaluateBot(groups, 'Claude-Web')).toEqual({ status: 'allowed' });
  });
});
