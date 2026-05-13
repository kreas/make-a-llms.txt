export const KNOWN_AI_BOTS = [
  'GPTBot',
  'ClaudeBot',
  'Claude-Web',
  'PerplexityBot',
  'Google-Extended',
  'CCBot',
  'Bytespider',
  'Applebot-Extended',
  'Amazonbot',
] as const;

export type KnownAiBot = (typeof KNOWN_AI_BOTS)[number];

export type AuditBotStatus = 'allowed' | 'blocked' | 'partial' | 'default';

export type AuditBotResult = {
  status: AuditBotStatus;
  disallowedPaths?: string[];
};

export type AuditResults = Record<KnownAiBot, AuditBotResult>;
