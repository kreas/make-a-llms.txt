import Link from 'next/link';
import { PlusCircle } from 'lucide-react';

export function AddSiteCard() {
  return (
    <Link
      href="/sites/new"
      className="flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-hairline bg-canvas-soft p-6 transition-colors hover:border-primary"
    >
      <PlusCircle className="h-8 w-8 text-muted" />
      <span className="text-sm font-medium text-ink">Add New Project</span>
    </Link>
  );
}
