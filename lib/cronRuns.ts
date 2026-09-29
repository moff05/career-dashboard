import { getDb } from '@/lib/db';

// A persistent record of every weekly board-scan cron invocation — the
// board scan was silently dead for 2+ weeks once (see CLAUDE.md Done #42)
// and the only way to investigate after the fact was Vercel's own request
// logs, which on this project's Hobby plan only retain ~2 hours. By the
// time anyone thinks to check, the evidence is already gone. This table is
// the cheap fix: every run (success, partial failure, or hard crash) writes
// one row here, queryable anytime via GET /api/admin/cron-status.
export async function ensureCronRunsTable() {
  const db = getDb();
  await db.execute(`CREATE TABLE IF NOT EXISTS cron_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL DEFAULT (datetime('now')),
    success INTEGER NOT NULL,
    users_scanned INTEGER NOT NULL DEFAULT 0,
    users_with_errors INTEGER NOT NULL DEFAULT 0,
    total_staged INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    error TEXT
  )`);
  return db;
}

export async function recordCronRun(row: {
  startedAt: string;
  success: boolean;
  usersScanned: number;
  usersWithErrors: number;
  totalStaged: number;
  notes: string[];
  error?: string;
}) {
  try {
    const db = await ensureCronRunsTable();
    await db.execute({
      sql: `INSERT INTO cron_runs (started_at, success, users_scanned, users_with_errors, total_staged, notes, error)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        row.startedAt,
        row.success ? 1 : 0,
        row.usersScanned,
        row.usersWithErrors,
        row.totalStaged,
        row.notes.length > 0 ? JSON.stringify(row.notes) : null,
        row.error || null,
      ],
    });
  } catch (err) {
    // Logging the run's own health must never be what crashes the run.
    console.error('recordCronRun failed:', err);
  }
}
