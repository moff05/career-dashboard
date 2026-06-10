import { getDb } from './db';

interface Memory { content: string; category: string; }
interface Job { type: string; status: string; company: string; title: string; }
interface Profile {
  name?: string; graduation_date?: string; target_roles?: string;
  target_cities?: string; notes?: string;
}

export async function buildSystemPrompt(): Promise<string> {
  const db = getDb();

  const resumeRow = (await db.execute('SELECT raw_text FROM resume WHERE id = 1')).rows[0] as unknown as { raw_text: string } | undefined;
  const resumeText = resumeRow?.raw_text || 'Resume not yet parsed.';

  const profileRow = (await db.execute('SELECT name, graduation_date, target_roles, target_cities, notes FROM profile WHERE id = 1')).rows[0] as unknown as Profile | undefined;
  const name = profileRow?.name || 'Nicholas';
  const graduationDate = profileRow?.graduation_date || 'May 2027';
  const targetRoles = profileRow?.target_roles || 'PropTech Analyst, AI Product Manager, Business Technology Analyst, Solutions Engineer, Real Estate Technology Associate';
  const targetCities = profileRow?.target_cities || 'San Francisco, New York City, Atlanta, Dallas-Fort Worth, Miami';
  const profileNotes = profileRow?.notes || '';

  const memoriesRows = (await db.execute('SELECT content, category FROM memories ORDER BY category, created_at DESC')).rows as unknown as Memory[];
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

  const jobRows = (await db.execute('SELECT type, status, company, title FROM jobs')).rows as unknown as Job[];
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
- Target roles: ${targetRoles}
- Target cities (full-time post-grad): ${targetCities}
- Internship constraint: Remote or Miami, FL only (still in school)
- Graduation: ${graduationDate}
- Today's date: ${today}${profileNotes ? `\n- Additional context: ${profileNotes}` : ''}

Be specific, personalized, and reference their actual background. Proactively identify opportunities based on their CRE tech + AI automation background. Be concise but thorough. Format responses with markdown when helpful.`;
}
