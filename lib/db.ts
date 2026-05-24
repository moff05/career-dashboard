import { createClient } from '@libsql/client';

// Use globalThis to survive Next.js HMR module re-evaluation in dev
const g = globalThis as typeof globalThis & { __db?: ReturnType<typeof createClient> };

export function getDb() {
  if (!g.__db) {
    g.__db = createClient({
      url: process.env.TURSO_DATABASE_URL || 'file:./data/career.db',
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return g.__db;
}

export default getDb;
