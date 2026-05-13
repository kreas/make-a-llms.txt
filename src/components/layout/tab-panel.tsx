import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TabPanelProps {
  /** Left-side meta content above the card (e.g. filename, counts, last-checked). */
  meta?: ReactNode;
  /** Right-side action content above the card (e.g. Copy / Download / Re-audit buttons). */
  actions?: ReactNode;
  /** Card content. Wrapped in the standard card chrome. */
  children: ReactNode;
  /** Override the default card padding (e.g. `0` for full-bleed code blocks). */
  contentClassName?: string;
  /** Additional classes on the outer wrapper. */
  className?: string;
}

/**
 * Standardized layout for a tab's primary content block.
 *
 * Header row sits ABOVE the card with meta on the left and actions on the right.
 * The card below has consistent chrome — surface-card background, hairline border,
 * rounded-xl corners — matching the `pages.md` reference layout.
 */
export function TabPanel({
  meta,
  actions,
  children,
  contentClassName,
  className,
}: TabPanelProps) {
  const hasHeader = meta !== undefined || actions !== undefined;
  return (
    <div className={cn('space-y-3', className)}>
      {hasHeader && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">{meta}</div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div
        className={cn(
          'rounded-xl border border-hairline bg-surface-card',
          contentClassName ?? 'p-6',
        )}
      >
        {children}
      </div>
    </div>
  );
}
