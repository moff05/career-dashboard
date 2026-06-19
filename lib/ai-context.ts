import { getDb } from './db';

interface Memory { content: string; category: string; }
interface Job { type: string; status: string; company: string; title: string; }
interface Profile {
  name?: string; graduation_date?: string; target_roles?: string;
  target_cities?: string; notes?: string;
}

export async function buildSystemPrompt(userId: string): Promise<string> {
  const db = getDb();

  const resumeRow = (await db.execute({
    sql: 'SELECT raw_text FROM resume WHERE user_id = ?',
    args: [userId],
  })).rows[0] as unknown as { raw_text: string } | undefined;
  const resumeText = resumeRow?.raw_text || 'Resume not yet added.';

  const profileRow = (await db.execute({
    sql: 'SELECT name, graduation_date, target_roles, target_cities, notes FROM profile WHERE user_id = ?',
    args: [userId],
  })).rows[0] as unknown as Profile | undefined;
  const name = profileRow?.name || 'the user';
  const graduationDate = profileRow?.graduation_date || '';
  const targetRoles = profileRow?.target_roles || '';
  const targetCities = profileRow?.target_cities || '';
  const profileNotes = profileRow?.notes || '';

  const memoriesRows = (await db.execute({
    sql: 'SELECT content, category FROM memories WHERE user_id = ? ORDER BY category, created_at DESC',
    args: [userId],
  })).rows as unknown as Memory[];
  const memoriesByCategory: Record<string, string[]> = {};
  for (const m of memoriesRows) {
    if (!memoriesByCategory[m.category]) memoriesByCategory[m.category] = [];
    memoriesByCategory[m.category].push(m.content);
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

WHAT I KNOW ABOUT ${name.toUpperCase()} (Saved Memories):
${memoriesText}

CURRENT JOBS IN TRACKER:
${jobsSummaryText || 'No jobs tracked yet.'}

PREFERENCES & CONTEXT:
- Today's date: ${today}${targetRoles ? `\n- Target roles: ${targetRoles}` : ''}${targetCities ? `\n- Target cities: ${targetCities}` : ''}${graduationDate ? `\n- Graduation: ${graduationDate}` : ''}${profileNotes ? `\n- Additional context: ${profileNotes}` : ''}

Be specific, personalized, and reference their actual background. Be concise but thorough. Format responses with markdown when helpful.`;
}
