import { parseRobotsTxt } from '@/lib/robots-parser';

export type WildcardPosture = 'allow' | 'disallow' | 'unset';

/**
 * Determine the wildcard (User-agent: *) posture for root "/" from a robots.txt
 * body. Returns 'unset' if the file is missing or has no wildcard group.
 *
 * Walks the wildcard group's rules and picks the longest-matching root rule.
 * On length ties, `allow` wins (mirrors RFC 9309 semantics). A wildcard group
 * with no root-matching rule defaults to `allow`.
 */
export function wildcardPosture(content: string | null): WildcardPosture {
  if (content === null) return 'unset';
  const groups = parseRobotsTxt(content);
  for (const g of groups) {
    if (!g.userAgents.some((ua) => ua.trim() === '*')) continue;
    let best: { type: 'allow' | 'disallow'; length: number } | null = null;
    for (const r of g.rules) {
      if (r.path !== '' && r.path !== '/' && r.path !== '/*') continue;
      const len = r.path.length;
      if (
        !best ||
        len > best.length ||
        (len === best.length && r.type === 'allow')
      ) {
        best = { type: r.type, length: len };
      }
    }
    if (!best) return 'allow';
    return best.type === 'allow' ? 'allow' : 'disallow';
  }
  return 'unset';
}

export function wildcardBlocksRoot(content: string): boolean {
  return wildcardPosture(content) === 'disallow';
}
