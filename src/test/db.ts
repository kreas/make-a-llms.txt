import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { __setDbForTests } from '@/db';
import path from 'node:path';

export type TestDb = ReturnType<typeof drizzle>;

export async function setupTestDb(): Promise<TestDb> {
  const client = createClient({ url: ':memory:' });
  const db = drizzle(client);
  await migrate(db, {
    migrationsFolder: path.resolve(__dirname, '../../drizzle'),
  });
  __setDbForTests(db);
  return db;
}

export function resetTestDb() {
  __setDbForTests(null);
}
