import { withWorkflow } from 'workflow/next';
import { createMDX } from 'fumadocs-mdx/next';
import type { NextConfig } from 'next';

const withMDX = createMDX();

const nextConfig: NextConfig = {
  // Keep llmstxt and execa unbundled — we spawn the llmstxt CLI binary at
  // runtime, which Next.js's tracer can't follow through process.execPath.
  serverExternalPackages: ['llmstxt', 'execa'],

  // Explicitly drag the llmstxt package's source into the deployed function.
  // The trace covers all API routes (the CLI is invoked from workflow steps
  // that ultimately run inside an /api/.well-known/workflow/* handler).
  outputFileTracingIncludes: {
    'src/app/api/**': [
      './node_modules/llmstxt/**',
    ],
  },
};

export default withWorkflow(withMDX(nextConfig));
