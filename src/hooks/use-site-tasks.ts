'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SiteTask } from '@/db/schema';
import type { SerializedSiteTask } from '@/lib/tasks/serialize';

export type TaskFinding = {
  sourceType: SiteTask['sourceType'];
  sourceId: string;
  pageUrl?: string;
  title: string;
  foundText: string;
  fixText: string;
};

export function useSiteTasks(siteUid: string) {
  return useQuery({
    queryKey: ['siteTasks', siteUid],
    queryFn: async (): Promise<{ tasks: SerializedSiteTask[] }> => {
      const res = await fetch(`/api/sites/${siteUid}/tasks`);
      if (!res.ok) throw new Error(`status ${res.status}`);
      return res.json();
    },
  });
}

export function useCreateSiteTask(siteUid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (finding: TaskFinding): Promise<{ task: SerializedSiteTask }> => {
      const res = await fetch(`/api/sites/${siteUid}/tasks`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(finding),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? 'Failed to add task');
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['siteTasks', siteUid] }),
  });
}

export function useUpdateSiteTaskStatus(siteUid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      taskId: string;
      status: 'open' | 'done' | 'wont_do';
    }): Promise<{ task: SerializedSiteTask }> => {
      const res = await fetch(`/api/sites/${siteUid}/tasks/${input.taskId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: input.status }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? 'Failed to update task');
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['siteTasks', siteUid] }),
  });
}
