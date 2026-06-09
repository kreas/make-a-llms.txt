import type { SiteTask } from '@/db/schema';

export type SerializedSiteTask = {
  id: string;
  sourceType: SiteTask['sourceType'];
  sourceId: string;
  pageUrl: string;
  title: string;
  foundText: string;
  fixText: string;
  status: SiteTask['status'];
  createdAt: string;
  statusChangedAt: string;
};

export function serializeSiteTask(t: SiteTask): SerializedSiteTask {
  return {
    id: t.uid,
    sourceType: t.sourceType,
    sourceId: t.sourceId,
    pageUrl: t.pageUrl,
    title: t.title,
    foundText: t.foundText,
    fixText: t.fixText,
    status: t.status,
    createdAt: t.createdAt,
    statusChangedAt: t.statusChangedAt,
  };
}
