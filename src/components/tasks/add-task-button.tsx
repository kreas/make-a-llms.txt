'use client';

import { Plus, Check, Ban } from 'lucide-react';
import { useSiteTasks, useCreateSiteTask, type TaskFinding } from '@/hooks/use-site-tasks';
import { taskKey } from '@/lib/tasks/reconcile';

export function AddTaskButton({ siteUid, finding }: { siteUid: string; finding: TaskFinding }) {
  const tasksQuery = useSiteTasks(siteUid);
  const create = useCreateSiteTask(siteUid);

  const key = taskKey({
    sourceType: finding.sourceType,
    sourceId: finding.sourceId,
    pageUrl: finding.pageUrl ?? '',
  });
  const existing = tasksQuery.data?.tasks.find((t) => taskKey(t) === key);

  if (existing) {
    const label =
      existing.status === 'open' ? 'Added' : existing.status === 'wont_do' ? "Won't do" : 'Done';
    const Icon = existing.status === 'wont_do' ? Ban : Check;
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-hairline bg-canvas-soft px-2 py-1 text-xs text-muted-strong">
        <Icon className="h-3 w-3" aria-hidden />
        {label}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => create.mutate(finding)}
      disabled={create.isPending || tasksQuery.isLoading}
      className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-hairline bg-surface-card px-2 py-1 text-xs font-medium text-ink transition-colors hover:bg-canvas-soft disabled:opacity-50"
    >
      <Plus className="h-3 w-3" aria-hidden />
      {create.isPending ? 'Adding…' : 'Add task'}
    </button>
  );
}
