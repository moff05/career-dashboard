import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

interface JobRow {
  id: number;
  status: string;
  match_score: number | null;
  created_at: string | null;
  status_updated_at: string | null;
  deadline: string | null;
}

export async function GET() {
  try {
    const db = getDb();
    const rows = (await db.execute('SELECT id, status, match_score, created_at, status_updated_at, deadline FROM jobs')).rows as unknown as JobRow[];

    const statusCounts: Record<string, number> = { saved: 0, applied: 0, interviewing: 0, offer: 0, rejected: 0 };
    for (const r of rows) statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;

    const scored = rows.filter(r => r.match_score != null);
    const avgScore = scored.length > 0
      ? Math.round((scored.reduce((s, r) => s + r.match_score!, 0) / scored.length) * 10) / 10
      : null;

    const applied = statusCounts.applied + statusCounts.interviewing + statusCounts.offer + statusCounts.rejected;
    const responses = statusCounts.interviewing + statusCounts.offer;
    const responseRate = applied > 0 ? Math.round((responses / applied) * 100) : null;

    // Weekly activity: count jobs added per week for last 8 weeks
    const now = Date.now();
    const weeks: { label: string; count: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(now - i * 7 * 86400000);
      const weekEnd = new Date(now - (i - 1) * 7 * 86400000);
      const label = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const count = rows.filter(r => {
        if (!r.created_at) return false;
        const d = new Date(r.created_at).getTime();
        return d >= weekStart.getTime() && d < weekEnd.getTime();
      }).length;
      weeks.push({ label, count });
    }

    // Score distribution buckets
    const scoreBuckets = [
      { label: '9–10', min: 9, max: 10, count: 0 },
      { label: '7–8',  min: 7, max: 8,  count: 0 },
      { label: '5–6',  min: 5, max: 6,  count: 0 },
      { label: '1–4',  min: 1, max: 4,  count: 0 },
    ];
    for (const r of scored) {
      const s = r.match_score!;
      for (const b of scoreBuckets) { if (s >= b.min && s <= b.max) { b.count++; break; } }
    }

    // Time in stage (days): for jobs with status_updated_at
    const stageTimings: Record<string, number[]> = { applied: [], interviewing: [], offer: [], rejected: [] };
    for (const r of rows) {
      if (!r.created_at || !r.status_updated_at || r.status === 'saved') continue;
      const days = Math.round((new Date(r.status_updated_at).getTime() - new Date(r.created_at).getTime()) / 86400000);
      if (days >= 0 && stageTimings[r.status]) stageTimings[r.status].push(days);
    }
    const avgDaysToStage: Record<string, number | null> = {};
    for (const [stage, arr] of Object.entries(stageTimings)) {
      avgDaysToStage[stage] = arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
    }

    return NextResponse.json({
      statusCounts,
      avgScore,
      responseRate,
      totalJobs: rows.length,
      weeks,
      scoreBuckets,
      avgDaysToStage,
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json({ error: 'Analytics failed' }, { status: 500 });
  }
}
