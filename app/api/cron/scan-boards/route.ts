import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { scanBoardsForUser, type PostingsCache, type ScanUserStats } from '@/lib/scanBoards';
import { recordCronRun } from '@/lib/cronRuns';

// Weekly job-board scan (see vercel.json — every Monday): for every user who
// has both target_roles and target_cities set, scans that user's own tracked
// Companies list (whichever of them resolve to a Greenhouse/Lever/Ashby/
// Workday board via companies.career_url — see lib/boardCompanies.ts),
// filters postings against that user's own profile, scores the survivors
// with the same fit rubric as a manual "AI Score" click, and stages the best
// candidates as *pending review* rows in `discovered_jobs` — nothing is
// added to the real tracker automatically. The user reviews and
// adds/dismisses each one from the dashboard's Discovered tab
// (GET/PATCH /api/discovered). A user can also trigger an immediate re-scan
// themselves via POST /api/discovered/refresh, but only once their current
// queue is fully cleared (see that route) — this cron is the baseline weekly
// cadence, not the only way a scan runs.
//
// This is the productionized version of the `job_board_agent` skill piloted
// by hand on 2026-09-08 (~/aios/.claude/skills/job_board_agent.md).
//
// IMPORTANT HISTORY: an earlier version of this route matched on single
// words extracted from target_roles ("engineer", "data", "analyst", ...)
// and inserted directly into the real tracker. Tested once against
// production, it matched almost every posting on a few large boards and
// wrote 1,030 junk rows into two real users' trackers before being caught
// and cleaned up. Two independent fixes came out of that:
//   1. Matching now requires a bigram (two-word phrase) from target_roles,
//      or an exact phrase match — a single generic word is never enough
//      (see keywordPhrasesFromRoles/matchesKeywords in lib/scanBoards.ts).
//   2. Nothing touches the real `jobs` table until the user explicitly
//      approves a specific posting — see the staging table above.
// Treat any further change to the matching logic here as production code
// that writes real users' data on the first run, not a script to iterate on
// live — use ?dryRun=1 (below) and/or a local sqlite DB to test changes.

export const maxDuration = 60;

interface ProfileRow {
  user_id: string;
  target_roles: string;
  target_cities: string;
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  const dryRun = request.nextUrl.searchParams.get('dryRun') === '1';

  const db = getDb();
  const notes: string[] = [];
  let usersScannedCount = 0;

  try {
    const profiles = (await db.execute(
      `SELECT user_id, target_roles, target_cities FROM profile
       WHERE target_roles IS NOT NULL AND trim(target_roles) != ''
         AND target_cities IS NOT NULL AND trim(target_cities) != ''`
    )).rows as unknown as ProfileRow[];
    usersScannedCount = profiles.length;

    const perUser: Record<string, ScanUserStats> = {};
    const dryRunCandidates: Record<string, { company: string; title: string; location: string; url: string }[]> = {};

    // Two users can track the same company (e.g. both have Anduril) — cache
    // each distinct career_url's fetch across the whole run instead of
    // re-fetching it per user.
    const postingsCache: PostingsCache = new Map();

    let usersWithErrors = 0;
    let totalStaged = 0;
    for (const profile of profiles) {
      const result = await scanBoardsForUser(profile.user_id, profile, { dryRun, postingsCache, startedAt });
      perUser[profile.user_id] = result.stats;
      notes.push(...result.notes);
      if (result.notes.some((n) => n.includes('failed'))) usersWithErrors++;
      totalStaged += result.stats.staged;
      if (dryRun && result.dryRunCandidates) dryRunCandidates[profile.user_id] = result.dryRunCandidates;
    }

    // Recorded even on a dry run — a dry run failing is just as worth
    // knowing about as a real one, and dryRun is a query param not a
    // separate code path from here on.
    if (!dryRun) {
      await recordCronRun({ startedAt: startedAtIso, success: true, usersScanned: profiles.length, usersWithErrors, totalStaged, notes });
    }

    return NextResponse.json({
      dryRun,
      usersScanned: profiles.length,
      perUser,
      notes,
      ...(dryRun ? { dryRunCandidates } : {}),
    });
  } catch (error) {
    // The whole point of this table: a hard crash here used to mean zero
    // record of the run ever existing once Vercel's ~2h log retention
    // (Hobby plan) rolled past it — see lib/cronRuns.ts.
    const message = error instanceof Error ? error.message : String(error);
    console.error('GET /api/cron/scan-boards error:', error);
    await recordCronRun({ startedAt: startedAtIso, success: false, usersScanned: usersScannedCount, usersWithErrors: 0, totalStaged: 0, notes, error: message });
    return NextResponse.json({ error: 'Scan failed', detail: message }, { status: 500 });
  }
}
