import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type CheckRow = {
  id: string;
  passed: boolean;
  score: number;
  weight: number;
  evidence: string[];
  recommendation: string | null;
};

export function CitationsCheckRow({
  check,
  label,
}: {
  check: CheckRow;
  label: string;
}) {
  const Icon = check.passed ? Check : X;
  // semantic-success is in @theme inline; semantic-error is not, so use destructive.
  const iconClass = check.passed ? 'text-semantic-success' : 'text-destructive';
  return (
    <li className="border border-hairline rounded-lg p-3 bg-surface-card">
      <div className="flex items-start gap-2">
        <Icon className={cn('w-4 h-4 mt-1 shrink-0', iconClass)} aria-hidden />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium text-ink">{label}</span>
            <span className="text-xs text-body whitespace-nowrap">
              weight {check.weight} • {check.score}/100
            </span>
          </div>
          {check.evidence.length > 0 && (
            <p className="text-sm text-body mt-1">Found: {check.evidence.join(' ')}</p>
          )}
          {check.recommendation && (
            <p className="text-sm text-ink mt-1">Fix: {check.recommendation}</p>
          )}
        </div>
      </div>
    </li>
  );
}
