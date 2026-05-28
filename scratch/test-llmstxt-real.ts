import { runLlmstxt } from '../src/lib/llmstxt';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function run() {
  console.log("Running real llmstxt check...\n");
  try {
    const result = await runLlmstxt({
      subcommand: 'gen',
      sitemapUrl: 'https://civilization.agency/sitemap.xml',
      blobPath: 'test-llms.txt',
      maxBytes: 10 * 1024 * 1024,
    });
    console.log("Upload success! Result:", result);
  } catch (error: any) {
    console.error("Caught error:", error);
    if (error.cause) {
      console.error("Cause:", error.cause);
    }
  }
}

run();
