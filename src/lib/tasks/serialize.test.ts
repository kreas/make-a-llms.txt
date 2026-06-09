import { describe, it, expect } from 'vitest';
import { serializeSiteTask } from './serialize';
import type { SiteTask } from '@/db/schema';

describe('serializeSiteTask', () => {
  it('exposes uid as id and omits numeric ids', () => {
    const row: SiteTask = {
      id: 7,
      uid: 'task-uid-1',
      siteId: 3,
      sourceType: 'citation-check',
      sourceId: 'schema-type',
      pageUrl: 'https://x.com/about',
      title: 'Schema.org type',
      foundText: 'Unrecognized @type(s): JobPosting',
      fixText: 'Declare a Schema.org @type appropriate for this page.',
      status: 'open',
      createdAt: '2026-06-09T00:00:00Z',
      statusChangedAt: '2026-06-09T00:00:00Z',
    };
    const s = serializeSiteTask(row);
    expect(s.id).toBe('task-uid-1');
    expect(s).not.toHaveProperty('uid');
    expect(s).not.toHaveProperty('siteId');
    expect(s.status).toBe('open');
  });
});
