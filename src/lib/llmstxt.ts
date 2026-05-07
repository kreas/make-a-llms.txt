import { execa } from 'execa';
import { put } from '@vercel/blob';
import { Readable, PassThrough } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';

export type RunOpts = {
  subcommand: 'gen' | 'gen-full';
  sitemapUrl: string;
  blobPath: string;
  maxBytes: number;
};

export type RunResult = {
  blobPath: string;
  url: string;
  bytes: number;
};

const BIN = path.resolve(process.cwd(), 'node_modules/.bin/llmstxt');

export async function runLlmstxt(opts: RunOpts): Promise<RunResult> {
  const proc = execa(BIN, [opts.subcommand, opts.sitemapUrl], {
    buffer: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderrChunks = '';
  proc.stderr?.on('data', (c) => {
    stderrChunks += c.toString();
    if (stderrChunks.length > 4096) stderrChunks = stderrChunks.slice(-4096);
  });

  const { stream: guarded, done: guardDone, getError, getBytes } = guardSize(proc.stdout!, opts.maxBytes);

  const upload = put(opts.blobPath, Readable.toWeb(guarded) as any, {
    access: 'public',
    contentType: 'text/plain; charset=utf-8',
    addRandomSuffix: false,
  } as any);

  let result: { url: string; pathname: string };
  let procResult: { exitCode: number; stderr: string };
  try {
    [result, procResult] = await Promise.all([upload, proc, guardDone]);
  } catch (err: any) {
    const guardErr = getError();
    if (guardErr) throw guardErr;
    const exit = err?.exitCode ?? 'unknown';
    const tail = (stderrChunks || err?.message || '').slice(-500);
    throw new Error(`llmstxt ${opts.subcommand} failed (exit code ${exit}): ${tail}`);
  }

  const guardErr = getError();
  if (guardErr) throw guardErr;

  if (procResult.exitCode !== 0) {
    const tail = (stderrChunks || procResult.stderr || '').slice(-500);
    throw new Error(
      `llmstxt ${opts.subcommand} failed (exit code ${procResult.exitCode}): ${tail}`,
    );
  }

  return { blobPath: opts.blobPath, url: result.url, bytes: getBytes() };
}

function guardSize(input: NodeJS.ReadableStream, maxBytes: number) {
  const out = new PassThrough();
  let bytes = 0;
  let error: Error | null = null;

  // We pipe manually so we can intercept data events for size counting
  input.on('data', (chunk: Buffer) => {
    bytes += chunk.length;
    if (bytes > maxBytes) {
      error = new Error(`Output exceeded size limit (${maxBytes} bytes).`);
      out.destroy(error);
      (input as any).destroy?.();
      return;
    }
    out.write(chunk);
  });
  input.on('end', () => out.end());
  input.on('error', (e) => out.destroy(e));

  // done resolves when the PassThrough stream finishes (or rejects on destroy)
  const done = new Promise<void>((resolve, reject) => {
    out.on('finish', resolve);
    out.on('close', () => {
      if (error) reject(error);
      else resolve();
    });
    out.on('error', (e) => {
      error = e as Error;
      reject(e);
    });
  });

  // Also drain the source stream in case nobody else consumes it (e.g. mocked put)
  out.resume();

  return {
    stream: out,
    done,
    getError: () => error,
    getBytes: () => bytes,
  };
}
