import { cn } from '@/lib/utils';

// Palette uses verified token classes from globals.css.
// semantic-error is not in @theme inline, so we use text-destructive / bg-destructive
// (shadcn binds --destructive → --semantic-error).
const PALETTE: Record<string, string> = {
  excellent: 'bg-semantic-success/15 text-semantic-success',
  good:      'bg-surface-strong/50 text-ink',
  fair:      'bg-surface-strong/30 text-body',
  poor:      'bg-destructive/15 text-destructive',
  none:      'bg-surface-strong/30 text-body',
};

type Tier = 'excellent' | 'good' | 'fair' | 'poor' | 'none';

export function CitationsTierPill({ tier, className }: { tier: Tier; className?: string }) {
  const label = tier === 'none' ? '—' : tier[0].toUpperCase() + tier.slice(1);
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs caption-uppercase',
        PALETTE[tier],
        className,
      )}
    >
      {label}
    </span>
  );
}
