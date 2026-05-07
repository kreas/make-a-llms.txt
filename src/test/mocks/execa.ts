import { vi } from 'vitest';
import { Readable } from 'node:stream';

export type FakeExecaResult = { stdout: string; stderr?: string; exitCode?: number };

export function mockExeca(handler: (args: string[]) => FakeExecaResult) {
  return vi.mock('execa', () => ({
    execa: vi.fn((_bin: string, args: string[]) => {
      const { stdout, stderr = '', exitCode = 0 } = handler(args);
      const stream = Readable.from([Buffer.from(stdout)]);
      const promise: any = Promise.resolve({ stdout, stderr, exitCode });
      promise.stdout = stream;
      promise.stderr = Readable.from([Buffer.from(stderr)]);
      return promise;
    }),
  }));
}
