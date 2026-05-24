import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { getDb } from '@/lib/db';

export const maxDuration = 60;

interface Job {
  id: number;
  company: string;
  title: string;
  status: string;
  deadline: string | null;
  url: string | null;
  status_updated_at: string | null;
}

function buildEmail(deadlineAlerts: { job: Job; daysLeft: number }[], staleJobs: Job[], now: Date): string {
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  let html = `<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;background:#1a1a1a;color:#e0e0e0;padding:32px;border-radius:12px;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:28px;">
      <div style="width:36px;height:36px;background:#d97706;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:800;color:white;font-size:14px;flex-shrink:0;">NM</div>
      <div>
        <div style="font-weight:600;font-size:15px;">Career Dashboard</div>
        <div style="color:#666;font-size:12px;">Daily Alerts · ${dateStr}</div>
      </div>
    </div>`;

  if (deadlineAlerts.length > 0) {
    html += `<div style="margin-bottom:28px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#555;margin-bottom:12px;">Upcoming Deadlines</div>`;
    for (const { job, daysLeft } of deadlineAlerts) {
      const color = daysLeft === 3 ? '#ef4444' : '#f59e0b';
      const dueStr = new Date(job.deadline!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      html += `<div style="background:#222;border-radius:8px;padding:14px 16px;margin-bottom:8px;border-left:3px solid ${color};">
        <div style="font-weight:600;font-size:14px;">${job.title}</div>
        <div style="color:#888;font-size:12px;margin-top:2px;">${job.company}</div>
        <div style="margin-top:8px;font-size:12px;color:${color};font-weight:600;">⏰ ${daysLeft} days left · Due ${dueStr}</div>
        ${job.url ? `<a href="${job.url}" style="display:inline-block;margin-top:8px;font-size:11px;color:#d97706;text-decoration:none;">View posting →</a>` : ''}
      </div>`;
    }
    html += `</div>`;
  }

  if (staleJobs.length > 0) {
    html += `<div style="margin-bottom:28px;">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#555;margin-bottom:12px;">Follow Up Needed</div>`;
    for (const job of staleJobs) {
      const daysSince = Math.floor((now.getTime() - new Date(job.status_updated_at!).getTime()) / (1000 * 60 * 60 * 24));
      html += `<div style="background:#222;border-radius:8px;padding:14px 16px;margin-bottom:8px;border-left:3px solid #7c3aed;">
        <div style="font-weight:600;font-size:14px;">${job.title}</div>
        <div style="color:#888;font-size:12px;margin-top:2px;">${job.company}</div>
        <div style="margin-top:8px;font-size:12px;color:#a78bfa;font-weight:600;">Applied ${daysSince} days ago — no update yet</div>
      </div>`;
    }
    html += `</div>`;
  }

  html += `<div style="border-top:1px solid #2a2a2a;padding-top:16px;font-size:11px;color:#444;">
    Sent by your Career Dashboard
  </div></div>`;

  return html;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const db = getDb();
  const now = new Date();

  const allJobs = (await db.execute(
    "SELECT id, company, title, status, deadline, url, status_updated_at FROM jobs WHERE status NOT IN ('rejected', 'offer')"
  )).rows as unknown as Job[];

  // 7-day and 3-day deadline alerts
  const deadlineAlerts: { job: Job; daysLeft: number }[] = [];
  for (const job of allJobs) {
    if (!job.deadline) continue;
    const daysLeft = Math.round((new Date(job.deadline).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft === 7 || daysLeft === 3) deadlineAlerts.push({ job, daysLeft });
  }

  // Applied 14+ days ago with no status change
  const staleJobs = allJobs.filter(job => {
    if (job.status !== 'applied' || !job.status_updated_at) return false;
    const daysSince = (now.getTime() - new Date(job.status_updated_at).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince >= 14;
  });

  if (deadlineAlerts.length === 0 && staleJobs.length === 0) {
    return NextResponse.json({ sent: false, reason: 'nothing to alert' });
  }

  const subject = deadlineAlerts.length > 0
    ? `⏰ ${deadlineAlerts.length} deadline${deadlineAlerts.length > 1 ? 's' : ''} coming up`
    : `📋 ${staleJobs.length} application${staleJobs.length > 1 ? 's need' : ' needs'} follow-up`;

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
    to: 'nicmoffett5@gmail.com',
    subject,
    html: buildEmail(deadlineAlerts, staleJobs, now),
  });

  return NextResponse.json({ sent: true, deadlineAlerts: deadlineAlerts.length, staleJobs: staleJobs.length });
}
