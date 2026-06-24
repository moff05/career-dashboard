import { getDb } from './db';

interface Memory { content: string; category: string; created_at: string; }
interface Job { type: string; status: string; company: string; title: string; }
interface Profile {
  name?: string; graduation_date?: string; target_roles?: string;
  target_cities?: string; notes?: string; email?: string; phone?: string; linkedin?: string;
}

export async function buildSystemPrompt(userId: string): Promise<string> {
  const db = getDb();

  const resumeRow = (await db.execute({
    sql: 'SELECT raw_text FROM resume WHERE user_id = ? AND is_default = 1',
    args: [userId],
  })).rows[0] as unknown as { raw_text: string } | undefined;
  const resumeText = resumeRow?.raw_text || 'Resume not yet added.';

  const profileRow = (await db.execute({
    sql: 'SELECT name, graduation_date, target_roles, target_cities, notes, email, phone, linkedin FROM profile WHERE user_id = ?',
    args: [userId],
  })).rows[0] as unknown as Profile | undefined;
  const name = profileRow?.name || 'the user';
  const graduationDate = profileRow?.graduation_date || '';
  const targetRoles = profileRow?.target_roles || '';
  const targetCities = profileRow?.target_cities || '';
  const profileNotes = profileRow?.notes || '';
  const email = profileRow?.email || '';
  const phone = profileRow?.phone || '';
  const linkedin = profileRow?.linkedin || '';

  const memoriesRows = (await db.execute({
    sql: 'SELECT content, category, created_at FROM memories WHERE user_id = ? ORDER BY category, created_at DESC',
    args: [userId],
  })).rows as unknown as Memory[];
  const memoriesByCategory: Record<string, string[]> = {};
  for (const m of memoriesRows) {
    if (!memoriesByCategory[m.category]) memoriesByCategory[m.category] = [];
    const date = m.created_at ? new Date(m.created_at.replace(' ', 'T') + 'Z').toISOString().slice(0, 10) : '';
    memoriesByCategory[m.category].push(date ? `[${date}] ${m.content}` : m.content);
  }
  const memoriesText = Object.keys(memoriesByCategory).length === 0
    ? 'No memories saved yet.'
    : Object.entries(memoriesByCategory)
        .map(([cat, items]) => `[${cat.toUpperCase()}]\n${items.map(i => `- ${i}`).join('\n')}`)
        .join('\n\n');

  const jobRows = (await db.execute({
    sql: 'SELECT type, status, company, title FROM jobs WHERE user_id = ?',
    args: [userId],
  })).rows as unknown as Job[];
  const jobSummaryMap: Record<string, string[]> = {};
  for (const job of jobRows) {
    if (!jobSummaryMap[job.status]) jobSummaryMap[job.status] = [];
    jobSummaryMap[job.status].push(`${job.company} - ${job.title} (${job.type})`);
  }
  const jobsSummaryText = Object.entries(jobSummaryMap)
    .map(([status, list]) => `${status.toUpperCase()}:\n${list.map(j => `  - ${j}`).join('\n')}`)
    .join('\n\n');

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return `You are an expert AI career coach for ${name}. You have full context about them:

RESUME:
${resumeText}

WHAT I KNOW ABOUT ${name.toUpperCase()} (Saved Memories, dated):
${memoriesText}

Memories are notes from past conversations, not fixed truth — people's goals and preferences change. If a memory conflicts with something the user is saying right now, or with a more recent memory, trust the newer one and what they're telling you in this conversation. Don't hold them to an old stated goal as if it still applies by default.

CURRENT JOBS IN TRACKER:
${jobsSummaryText || 'No jobs tracked yet.'}

PREFERENCES & CONTEXT:
- Today's date: ${today}${targetRoles ? `\n- Target roles: ${targetRoles}` : ''}${targetCities ? `\n- Target cities: ${targetCities}` : ''}${graduationDate ? `\n- Graduation: ${graduationDate}` : ''}${profileNotes ? `\n- Additional context: ${profileNotes}` : ''}${email ? `\n- Email: ${email}` : ''}${phone ? `\n- Phone: ${phone}` : ''}${linkedin ? `\n- LinkedIn: ${linkedin}` : ''}
${email || phone || linkedin ? 'Use the contact info above for a cover letter signature block or outreach drafts when relevant — never invent contact info that isn\'t listed here.' : ''}

Be specific, personalized, and reference their actual background. Be concise but thorough. Format responses with markdown when helpful. Do not use emojis.`;
}
