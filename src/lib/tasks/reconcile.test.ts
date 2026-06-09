import { describe, it, expect } from 'vitest';
import {
  taskKey,
  citationPassedKeys,
  geoPassedKeys,
  findVerifiableUids,
} from './reconcile';

const task = (over: Partial<Parameters<typeof findVerifiableUids>[0][number]> = {}) => ({
  uid: 'u1',
  status: 'open' as const,
  sourceType: 'citation-check' as const,
  sourceId: 'schema-type',
  pageUrl: 'https://x.com/about',
  ...over,
});

describe('taskKey', () => {
  it('distinguishes the same check on different pages', () => {
    expect(taskKey(task())).not.toBe(taskKey(task({ pageUrl: 'https://x.com/' })));
  });

  it('distinguishes source types with the same id', () => {
    expect(taskKey(task())).not.toBe(taskKey(task({ sourceType: 'geo-signal' })));
  });
});

describe('citationPassedKeys', () => {
  it('returns keys only for passing checks, bound to the page URL', () => {
    const keys = citationPassedKeys('https://x.com/about', {
      checks: [
        { id: 'schema-type', passed: true },
        { id: 'h1-present', passed: false },
      ],
    });
    expect(keys).toEqual([
      taskKey({ sourceType: 'citation-check', sourceId: 'schema-type', pageUrl: 'https://x.com/about' }),
    ]);
  });

  it('returns [] when there are no checks', () => {
    expect(citationPassedKeys('https://x.com/about', { checks: [] })).toEqual([]);
  });
});

describe('geoPassedKeys', () => {
  it('returns keys for present signals with empty pageUrl', () => {
    const keys = geoPassedKeys({
      signals: [
        { signal: 'case-studies', present: true },
        { signal: 'pricing-clarity', present: false },
      ],
    });
    expect(keys).toEqual([
      taskKey({ sourceType: 'geo-signal', sourceId: 'case-studies', pageUrl: '' }),
    ]);
  });
});

describe('findVerifiableUids', () => {
  const passed = new Set([taskKey(task())]);

  it('verifies open tasks whose check now passes', () => {
    expect(findVerifiableUids([task()], passed)).toEqual(['u1']);
  });

  it('verifies done tasks too', () => {
    expect(findVerifiableUids([task({ status: 'done' })], passed)).toEqual(['u1']);
  });

  it('never touches wont_do or already-verified tasks', () => {
    expect(findVerifiableUids([task({ status: 'wont_do' })], passed)).toEqual([]);
    expect(findVerifiableUids([task({ status: 'verified' })], passed)).toEqual([]);
  });

  it('leaves tasks alone when their check is not in the passed set', () => {
    expect(findVerifiableUids([task({ sourceId: 'h1-present' })], passed)).toEqual([]);
  });

  it('returns [] when tasks list is empty', () => {
    expect(findVerifiableUids([], new Set([taskKey(task())]))).toEqual([]);
  });

  it('returns [] when passed-keys set is empty', () => {
    expect(findVerifiableUids([task()], new Set())).toEqual([]);
  });
});
