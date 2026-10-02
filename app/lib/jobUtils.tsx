'use client';

import { AlertTriangle, Clock, Zap, Users } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Job {
  id: number; company: string; title: string; type: string; status: string;
  match_score: number | null; posting_date: string | null; deadline: string | null;
  url: string | null; description: string | null; salary_range: string | null;
  location: string | null; source: string | null; notes: string | null;
  created_at: string; status_updated_at: string | null; starred: number;
  score_data?: string | null; gaps_data?: string | null; bullets_data?: string | null; cover_letter_data?: string | null;
}

export interface DiscoveredJob {
  id: number; company: string; title: string; type: string; location: string | null;
  url: string; description: string | null; posting_date: string | null; source: string | null;
  match_score: number | null; score_data: string | null; status: string; created_at: string;
}

export interface AnalysisCategory { name: string; score: number; max: number; rationale: string; }
export interface AnalysisResult { categories: AnalysisCategory[]; total: number; summary: string; }
export type AnalysisState = AnalysisResult | 'loading' | 'error';

export interface GapsResult { gaps: { skill: string; severity: string; how_to_address: string }[]; positioning: string; quick_wins: string[]; should_apply: boolean; apply_reasoning: string; }
export type GapsState = GapsResult | 'loading' | 'error';

export interface BulletsResult { lead_with: { experience: string; why: string }[]; tailored_bullets: { original: string; tailored: string; why: string }[]; keywords_to_add: string[]; deprioritize: string[]; }
export type BulletsState = BulletsResult | 'loading' | 'error';

export interface CoverLetterResult { letter: string; tone: string; keywords?: string[]; }
export type CoverLetterState = CoverLetterResult | 'loading' | 'error';

export interface Priority {
  level: 'urgent' | 'soon' | 'interview' | 'connection_followup';
  label: string; sub: string; score: number | null;
  // Job-rooted priorities (urgent/soon/interview) set jobId and jumpToJob to
  // it. connection_followup instead sets connectionName, which opens the
  // Connections overlay pre-searched to that name — a connection follow-up
  // isn't tied to any tracked job.
  jobId?: number; connectionName?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const STATUS_STYLE: Record<string, { bg: string; text: string; border: string }> = {
  saved:        { bg: 'rgba(122,143,168,0.1)', text: 'var(--text-muted)', border: 'rgba(122,143,168,0.2)' },
  applied:      { bg: 'rgba(129,140,248,0.1)', text: '#818cf8', border: 'rgba(129,140,248,0.25)' },
  interviewing: { bg: 'rgba(6,182,212,0.1)',   text: '#06b6d4', border: 'rgba(6,182,212,0.25)' },
  offer:        { bg: 'var(--success-bg)',      text: 'var(--success)', border: 'var(--success-bg)' },
  rejected:     { bg: 'var(--danger-bg)',       text: 'var(--danger)',  border: 'var(--danger-bg)' },
};

export const LEVEL_CFG = {
  urgent:             { icon: <AlertTriangle size={12} color="var(--danger)" />,     tag: 'Urgent',    color: 'var(--danger)' },
  soon:               { icon: <Clock         size={12} color="var(--accent)" />,     tag: 'Soon',      color: 'var(--accent)' },
  interview:          { icon: <Zap           size={12} color="var(--success)" />,    tag: 'Prep',      color: 'var(--success)' },
  connection_followup: { icon: <Users        size={12} color="var(--text-muted)" />, tag: 'Reach out', color: 'var(--text-muted)' },
};

export const TYPE_OPTIONS = [
  { value: 'full-time', label: 'Full-Time' },
  { value: 'part-time', label: 'Part-Time' },
  { value: 'internship', label: 'Internship' },
];

export const TYPE_COLORS: Record<string, string> = {
  'full-time': 'var(--accent-hi)', 'part-time': '#0891b2', 'internship': 'var(--success)',
};

export const STATUS_OPTIONS = ['saved', 'applied', 'interviewing', 'offer', 'rejected'];

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export function scoreColor(s: number) {
  if (s >= 80) return 'var(--success)'; if (s >= 60) return 'var(--accent)'; return 'var(--danger)';
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning'; if (h < 17) return 'Good afternoon'; return 'Good evening';
}

export function deadlineDays(deadline: string) {
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
}

export function typeLabel(type: string): string {
  return TYPE_OPTIONS.find(t => t.value === type)?.label || type;
}

// Urgency bucket (deadline > interview prep) is the primary sort — fit score
// only breaks ties within a bucket. Free, no AI call.
//
// Job-application "follow up" (14+ days with no response) was cut 2026-09-29
// — a cold application isn't something you can meaningfully follow up on the
// way you can with a person, so the nudge had no real action behind it. The
// same staleness pattern stays for *connections* (see getConnectionFollowups
// below), where logging an actual conversation gives it something real to
// prompt.
export function getPriorities(jobs: Job[]): Priority[] {
  const deadlineItems: (Priority & { days: number })[] = [];
  for (const j of jobs) {
    // A deadline only matters until you've acted on it — once a job is past
    // 'saved' (applied, interviewing, offer, rejected) the alert has nothing
    // left to prompt. Interviewing jobs still get their own prep item below.
    if (!j.deadline || j.status !== 'saved') continue;
    const days = deadlineDays(j.deadline);
    if (days < 0) continue;
    if (days <= 3) deadlineItems.push({ level: 'urgent', label: `${j.title} at ${j.company}`, sub: `Deadline ${days === 0 ? 'today' : `in ${days}d`}`, jobId: j.id, score: j.match_score, days });
    else if (days <= 7) deadlineItems.push({ level: 'soon', label: `${j.company} — ${j.title}`, sub: `Due in ${days} days`, jobId: j.id, score: j.match_score, days });
  }
  deadlineItems.sort((a, b) => a.days - b.days || (b.score ?? -1) - (a.score ?? -1));

  const interviews: Priority[] = [];
  for (const j of jobs) {
    if (j.status === 'interviewing') interviews.push({ level: 'interview', label: `Prep — ${j.company}`, sub: j.title, jobId: j.id, score: j.match_score });
  }
  interviews.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  return [...deadlineItems, ...interviews];
}

export interface ConnectionForPriority {
  id: number; name: string; company: string;
  last_log_date?: string | null; last_log_note?: string | null;
}

// Same free, no-AI-call pattern as getPriorities' job follow-ups, applied to
// connections instead: once you've logged a conversation, staying silent
// past the threshold surfaces it again as a reminder — nothing to configure,
// just keep logging updates as you talk to people. A connection with no log
// entries yet has nothing to go stale, so it never appears here.
export function getConnectionFollowups(connections: ConnectionForPriority[], thresholdDays = 14): Priority[] {
  const items: (Priority & { days: number })[] = [];
  for (const c of connections) {
    if (!c.last_log_date) continue;
    const days = Math.floor((Date.now() - new Date(c.last_log_date).getTime()) / 86400000);
    if (days < thresholdDays) continue;
    items.push({
      level: 'connection_followup',
      label: `Follow up — ${c.name}`,
      sub: `${c.company} · logged ${days}d ago${c.last_log_note ? `: ${c.last_log_note}` : ''}`,
      score: null,
      connectionName: c.name,
      days,
    });
  }
  items.sort((a, b) => b.days - a.days);
  return items.map(({ days: _days, ...p }) => p);
}

// ─── Display components ───────────────────────────────────────────────────────

export function DeadlineDisplay({ deadline }: { deadline: string | null }) {
  if (!deadline) return <span style={{ color: 'var(--text-dim)' }}>—</span>;
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(deadline); d.setHours(0,0,0,0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return <span style={{ color: 'var(--danger)', fontSize: '11px' }}>Expired</span>;
  if (diff === 0) return <span style={{ color: 'var(--danger)', fontSize: '11px', fontWeight: 700 }}>Today!</span>;
  if (diff <= 3) return <span style={{ color: 'var(--danger)', fontSize: '11px', fontWeight: 600 }}>{diff}d left</span>;
  if (diff <= 7) return <span style={{ color: 'var(--accent)', fontSize: '11px' }}>{diff}d left</span>;
  if (diff <= 30) return <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{diff}d</span>;
  return <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>;
}
