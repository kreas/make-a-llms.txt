'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Check, Ban, RotateCcw, ArrowUpRight, ClipboardList } from 'lucide-react';
import { useSiteTasks, useUpdateSiteTaskStatus } from '@/hooks/use-site-tasks';
import { usePageWorkspace } from '@/components/generations/page-workspace-context';
import type { SerializedSiteTask } from '@/lib/tasks/serialize';
import { cn } from '@/lib/utils';

export function TasksPanel({ siteUid }: { siteUid: string }) {
  const tasksQuery = useSiteTasks(siteUid);
  const tasks = tasksQuery.data?.tasks ?? [];

  if (tasksQuery.isLoading) {
    return <p className="px-2 py-6 text-sm text-muted-strong">Loading tasks…</p>;
  }

  if (tasks.length === 0) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center">
        <ClipboardList className="h-8 w-8 text-muted-soft" aria-hidden />
        <p className="mt-4 text-base text-muted-strong">
          No tasks yet — add one from any failing audit check.
        </p>
      </div>
    );
  }

  const open = tasks.filter((t) => t.status === 'open');
  const completed = tasks.filter((t) => t.status === 'done' || t.status === 'verified');
  const wontDo = tasks.filter((t) => t.status === 'wont_do');

  return (
    <div className="flex flex-col gap-8">
      <TaskGroup label="Open" tasks={open} siteUid={siteUid} emptyHint="Nothing open — nice." />
      {completed.length > 0 && <TaskGroup label="Completed" tasks={completed} siteUid={siteUid} />}
      {wontDo.length > 0 && <TaskGroup label="Won't do" tasks={wontDo} siteUid={siteUid} dimmed />}
    </div>
  );
}

function TaskGroup({
  label,
  tasks,
  siteUid,
  dimmed,
  emptyHint,
}: {
  label: string;
  tasks: SerializedSiteTask[];
  siteUid: string;
  dimmed?: boolean;
  emptyHint?: string;
}) {
  return (
    <section className={cn(dimmed && 'opacity-60')}>
      <h3 className="caption-uppercase mb-2 text-xs text-body">{label}</h3>
      {tasks.length === 0 ? (
        <p className="px-1 py-2 text-sm text-muted-strong">{emptyHint}</p>
      ) : (
        <ul className="divide-y divide-hairline">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} siteUid={siteUid} />
          ))}
        </ul>
      )}
    </section>
  );
}

function TaskRow({ task, siteUid }: { task: SerializedSiteTask; siteUid: string }) {
  const update = useUpdateSiteTaskStatus(siteUid);
  const pathname = usePathname();
  const { pages } = usePageWorkspace();

  const sourceHref = (() => {
    if (task.sourceType === 'citation-check') {
      const page = pages.find((p) => p.url === task.pageUrl);
      return page?.path
        ? `${pathname}?tab=readable&page=${encodeURIComponent(page.path)}`
        : null;
    }
    if (task.sourceType === 'geo-signal') return `${pathname}?tab=recommendable`;
    if (task.sourceType === 'crawler-audit') return `${pathname}?tab=setup`;
    return null;
  })();

  const isOpen = task.status === 'open';
  const isChecked = task.status === 'done' || task.status === 'verified';

  return (
    <li className="flex gap-3 py-3">
      <button
        type="button"
        onClick={() => isOpen && update.mutate({ taskId: task.id, status: 'done' })}
        disabled={!isOpen || update.isPending}
        aria-label={isOpen ? 'Mark done' : task.status === 'wont_do' ? "Won't do" : 'Completed'}
        className={cn(
          'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
          isChecked
            ? 'border-semantic-success bg-semantic-success/10 text-semantic-success'
            : 'border-hairline-strong bg-surface-card',
          isOpen && 'cursor-pointer hover:bg-canvas-soft',
        )}
      >
        {isChecked && <Check className="h-3.5 w-3.5" aria-hidden />}
        {task.status === 'wont_do' && <Ban className="h-3 w-3 text-muted-strong" aria-hidden />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className={cn('font-medium text-ink', !isOpen && 'line-through decoration-hairline-strong')}>
            {task.title}
          </p>
          {task.status === 'verified' && (
            <span className="whitespace-nowrap rounded-full border border-hairline bg-canvas-soft px-2 py-px text-[10px] font-semibold uppercase tracking-wide text-semantic-success">
              Verified by audit
            </span>
          )}
        </div>
        {task.pageUrl && (
          <p className="mt-0.5 truncate font-mono text-xs text-muted-strong" title={task.pageUrl}>
            {task.pageUrl}
          </p>
        )}
        {task.fixText && <p className="mt-1 text-sm text-body">{task.fixText}</p>}

        <div className="mt-2 flex items-center gap-3">
          {isOpen && (
            <button
              type="button"
              onClick={() => update.mutate({ taskId: task.id, status: 'wont_do' })}
              disabled={update.isPending}
              aria-label="Won't do"
              className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-strong transition-colors hover:text-ink"
            >
              <Ban className="h-3 w-3" aria-hidden /> Won&apos;t do
            </button>
          )}
          {!isOpen && (
            <button
              type="button"
              onClick={() => update.mutate({ taskId: task.id, status: 'open' })}
              disabled={update.isPending}
              aria-label="Reopen"
              className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-strong transition-colors hover:text-ink"
            >
              <RotateCcw className="h-3 w-3" aria-hidden /> Reopen
            </button>
          )}
          {sourceHref && (
            <Link
              href={sourceHref}
              className="inline-flex items-center gap-1 text-xs text-muted-strong transition-colors hover:text-ink"
            >
              <ArrowUpRight className="h-3 w-3" aria-hidden /> View source
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}
