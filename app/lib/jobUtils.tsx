'use client';

import { AlertTriangle, Clock, Bell, Zap } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Job {
  id: number; company: string; title: string; type: string; status: string;
  match_score: number | null; posting_date: string | null; deadline: string | null;
  url: string | null; description: string | null; salary_range: string | null;
  location: string | null; source: string | null; notes: string | null;
  created_at: string; status_updated_at: string | null; starred: number;
  score_data?: string | null; gaps_data?: string | null; bullets_data?: string | null; cover_letter_data?: string | null;
  type_year?: number | null;
}

export interface AnalysisCategory { name: string; score: number; max: number; rationale: string; }
export interface AnalysisResult { categories: AnalysisCategory[]; total: number; summary: string; }
export type AnalysisState = AnalysisResult | 'loading' | 'error' | 'no-key';

export interface GapsResult { gaps: { skill: string; severity: string; how_to_address: string }[]; positioning: string; quick_wins: string[]; should_apply: boolean; apply_reasoning: string; }
export type GapsState = GapsResult | 'loading' | 'error';

export interface BulletsResult { lead_with: { experience: string; why: string }[]; tailored_bullets: { original: string; tailored: string; why: string }[]; keywords_to_add: string[]; deprioritize: string[]; }
export type BulletsState = BulletsResult | 'loading' | 'error';

export interface CoverLetterResult { letter: string; tone: string; keywords?: string[]; }
export type CoverLetterState = CoverLetterResult | 'loading' | 'error';

export interface Priority {
  level: 'urgent' | 'soon' | 'followup' | 'interview';
  label: string; sub: string; jobId: number; score: number | null;
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
  urgent:    { icon: <AlertTriangle size={12} color="var(--danger)" />,     tag: 'Urgent',    color: 'var(--danger)' },
  soon:      { icon: <Clock         size={12} color="var(--accent)" />,     tag: 'Soon',      color: 'var(--accent)' },
  followup:  { icon: <Bell          size={12} color="var(--text-muted)" />, tag: 'Follow up', color: 'var(--text-muted)' },
  interview: { icon: <Zap           size={12} color="var(--success)" />,    tag: 'Prep',      color: 'var(--success)' },
};

export const TYPE_OPTIONS = [
  { value: 'fall-internship',   label: 'Fall Internship' },
  { value: 'spring-internship', label: 'Spring Internship' },
  { value: 'summer-internship', label: 'Summer Intern' },
  { value: 'full-time',         label: 'Full-Time' },
];

export const TYPE_COLORS: Record<string, string> = {
  'fall-internship': '#7c3aed', 'spring-internship': '#0891b2',
  'summer-internship': 'var(--success)', 'full-time': 'var(--accent-hi)',
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

export function typeLabel(type: string, year?: number | null): string {
  if (type === 'fall-internship') return year ? `Fall '${String(year).slice(2)}` : 'Fall Intern';
  if (type === 'spring-internship') return year ? `Spring '${String(year).slice(2)}` : 'Spring Intern';
  return TYPE_OPTIONS.find(t => t.value === type)?.label || type;
}

// Urgency bucket (deadline > follow-up > interview prep) is the primary sort —
// fit score only breaks ties within a bucket. Free, no AI call.
export function getPriorities(jobs: Job[]): Priority[] {
  const deadlineItems: (Priority & { days: number })[] = [];
  for (const j of jobs) {
    if (!j.deadline || j.status === 'rejected' || j.status === 'offer') continue;
    const days = deadlineDays(j.deadline);
    if (days < 0) continue;
    if (days <= 3) deadlineItems.push({ level: 'urgent', label: `${j.title} at ${j.company}`, sub: `Deadline ${days === 0 ? 'today' : `in ${days}d`}`, jobId: j.id, score: j.match_score, days });
    else if (days <= 7) deadlineItems.push({ level: 'soon', label: `${j.company} — ${j.title}`, sub: `Due in ${days} days`, jobId: j.id, score: j.match_score, days });
  }
  deadlineItems.sort((a, b) => a.days - b.days || (b.score ?? -1) - (a.score ?? -1));

  const followups: Priority[] = [];
  for (const j of jobs) {
    if (j.status !== 'applied' || !j.status_updated_at) continue;
    const days = Math.floor((Date.now() - new Date(j.status_updated_at).getTime()) / 86400000);
    if (days >= 14) followups.push({ level: 'followup', label: `Follow up — ${j.company}`, sub: `${j.title} · applied ${days}d ago`, jobId: j.id, score: j.match_score });
  }
  followups.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  const interviews: Priority[] = [];
  for (const j of jobs) {
    if (j.status === 'interviewing') interviews.push({ level: 'interview', label: `Prep — ${j.company}`, sub: j.title, jobId: j.id, score: j.match_score });
  }
  interviews.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  return [...deadlineItems, ...followups, ...interviews];
}

// ─── Display components ───────────────────────────────────────────────────────

export function PostedDisplay({ date }: { date: string | null }) {
  if (!date) return <span style={{ color: 'var(--text-dim)' }}>—</span>;
  const d = new Date(date); d.setHours(0,0,0,0);
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Today</span>;
  if (diff < 0) return <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>;
  if (diff < 7) return <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{diff}d ago</span>;
  if (diff < 30) return <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{Math.round(diff/7)}w ago</span>;
  return <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>;
}

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
