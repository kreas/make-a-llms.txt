import { drizzle } from 'drizzle-orm/libsql';

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!_db) {
    _db = drizzle({
      connection: {
        url: process.env.TURSO_DATABASE_URL!,
        authToken: process.env.TURSO_AUTH_TOKEN!,
      },
    });
  }
  return _db;
}

/** Test-only: inject a pre-built drizzle client. Resets in-memory cache. */
export function __setDbForTests(client: ReturnType<typeof drizzle> | null) {
  _db = client;
}

export type Db = ReturnType<typeof drizzle>;
