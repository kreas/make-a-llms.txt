export type HelloPayload = { name: string };

/**
 * Hello workflow — entire body executes as a workflow. Steps invoked from here
 * (only `greet` in this case) are durable.
 */
export async function helloWorkflow({ name }: HelloPayload): Promise<string> {
  'use workflow';
  return greet(name);
}

async function greet(name: string): Promise<string> {
  'use step';
  return `hello, ${name}`;
}
