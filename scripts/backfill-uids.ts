import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { sql } from 'drizzle-orm';
import { generateUid } from '../src/lib/uid';

config({ path: '.env.local' });

const TABLES = [
  'users',
  'otp_codes',
  'sites',
  'generations',
  'crawler_audits',
  'robots_generator_drafts',
  'api_tokens',
] as const;

async function main() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error('TURSO_DATABASE_URL not set');
  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  const db = drizzle(client);

  for (const table of TABLES) {
    const rows = await db.all<{ id: number }>(sql.raw(`SELECT id FROM ${table} WHERE uid IS NULL`));
    if (rows.length === 0) {
      console.log(`[backfill] ${table}: already populated`);
      continue;
    }
    console.log(`[backfill] ${table}: ${rows.length} rows`);
    for (const row of rows) {
      await db.run(sql`UPDATE ${sql.raw(table)} SET uid = ${generateUid()} WHERE id = ${row.id}`);
    }
  }
  console.log('[backfill] done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
