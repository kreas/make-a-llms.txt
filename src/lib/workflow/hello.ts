import { defineWorkflow, runStep } from './wdk';

export type HelloPayload = { name: string };

/** Plain async runner — testable in isolation. */
export async function runHello({ name }: HelloPayload): Promise<string> {
  return runStep('greet', async () => `hello, ${name}`);
}

/** Registered workflow — invoked in production via start('hello', payload). */
export const helloWorkflow = defineWorkflow('hello', runHello);
