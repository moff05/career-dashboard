import { createClient } from '@libsql/client';

// Use globalThis to survive Next.js HMR module re-evaluation in dev
const g = globalThis as typeof globalThis & { __db?: ReturnType<typeof createClient> };

export function getDb() {
  if (!g.__db) {
    // libsql:// uses WebSocket (persistent connections) which hangs in
    // serverless — swap to https:// for HTTP-per-query which is faster here
    const rawUrl = process.env.TURSO_DATABASE_URL || 'file:./data/career.db';
    const url = rawUrl.startsWith('libsql://') ? rawUrl.replace('libsql://', 'https://') : rawUrl;
    g.__db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  return g.__db;
}

export default getDb;
