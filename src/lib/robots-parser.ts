export type RobotsRule = { type: 'allow' | 'disallow'; path: string };
export type RobotsGroup = { userAgents: string[]; rules: RobotsRule[] };

export function parseRobotsTxt(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasRule = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const stripped = rawLine.replace(/#.*$/, '').trim();
    if (!stripped) continue;

    const colon = stripped.indexOf(':');
    if (colon <= 0) continue;

    const directive = stripped.slice(0, colon).trim().toLowerCase();
    const value = stripped.slice(colon + 1).trim();
    if (!value) continue;

    if (directive === 'user-agent') {
      if (current && lastWasRule) {
        groups.push(current);
        current = null;
        lastWasRule = false;
      }
      if (!current) current = { userAgents: [], rules: [] };
      current.userAgents.push(value);
      continue;
    }

    if (directive === 'allow' || directive === 'disallow') {
      if (!current) continue;
      current.rules.push({ type: directive, path: value });
      lastWasRule = true;
      continue;
    }

    // Ignore unrecognized directives (Sitemap, Crawl-delay, etc.).
  }

  if (current) groups.push(current);
  return groups;
}

import type { AuditBotResult } from './known-ai-bots';

export function evaluateBot(
  groups: RobotsGroup[],
  botName: string,
): AuditBotResult {
  const matched = findSpecificGroup(groups, botName);
  if (!matched) return { status: 'default' };

  const rootAllowed = isRootAllowed(matched.rules);
  const disallows = matched.rules
    .filter((r) => r.type === 'disallow')
    .map((r) => r.path);

  if (disallows.length === 0) return { status: 'allowed' };

  if (!rootAllowed) return { status: 'blocked' };

  // Root reachable but other Disallow paths exist → partial.
  const nonRoot = disallows.filter((p) => p !== '/' && p !== '');
  if (nonRoot.length === 0) return { status: 'allowed' };
  return { status: 'partial', disallowedPaths: nonRoot };
}

function findSpecificGroup(
  groups: RobotsGroup[],
  botName: string,
): RobotsGroup | null {
  const lowerBot = botName.toLowerCase();
  let best: { group: RobotsGroup; length: number } | null = null;
  for (const g of groups) {
    for (const ua of g.userAgents) {
      const lowerUa = ua.toLowerCase();
      if (lowerUa === '*') continue;
      if (lowerUa === lowerBot) {
        if (!best || ua.length > best.length) {
          best = { group: g, length: ua.length };
        }
      }
    }
  }
  return best?.group ?? null;
}

function isRootAllowed(rules: RobotsRule[]): boolean {
  // Apply RFC 9309: longest matching path wins for "/"; Allow wins ties.
  let best: { type: 'allow' | 'disallow'; length: number } | null = null;
  for (const r of rules) {
    if (!matchesRoot(r.path)) continue;
    const len = r.path.length;
    if (!best || len > best.length || (len === best.length && r.type === 'allow')) {
      best = { type: r.type, length: len };
    }
  }
  if (!best) return true;
  return best.type === 'allow';
}

function matchesRoot(path: string): boolean {
  // A rule "matches" the root path "/" if the rule's path is "" or "/" or
  // a wildcard pattern that could start at root. We only need the binary
  // "blocks the root or not" answer here, so:
  if (path === '' || path === '/') return true;
  if (path === '/*') return true;
  return false;
}
