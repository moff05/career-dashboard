import { getDb } from './db';

interface Memory { content: string; category: string; }
interface Job { type: string; status: string; company: string; title: string; }

export async function buildSystemPrompt(): Promise<string> {
  const db = getDb();

  const resumeRow = (await db.execute('SELECT raw_text FROM resume WHERE id = 1')).rows[0] as unknown as { raw_text: string } | undefined;
  const resumeText = resumeRow?.raw_text || 'Resume not yet parsed.';

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

  return `You are an expert AI career coach for Nicholas Moffett. You have full context about him:

RESUME:
${resumeText}

WHAT I KNOW ABOUT NICHOLAS (Saved Memories):
${memoriesText}

CURRENT JOBS IN TRACKER:
${jobsSummaryText || 'No jobs tracked yet.'}

PREFERENCES & CONTEXT:
- Target cities (internships): Open to anywhere
- Target cities (full-time post-grad): San Francisco, New York City, Atlanta, Dallas-Fort Worth, Miami; open internationally: Sydney, London, Dubai
- Graduation: May 2027 (college junior)
- Currently in a summer internship at Goldenrod Companies (Real Estate Tech)
- Looking for: fall 2026 internships, spring 2027 internships, full-time starting May 2027
- Today's date: ${today}

Be specific, personalized, and reference his actual background. Proactively identify opportunities based on his CRE tech + AI automation background. Be concise but thorough. Format responses with markdown when helpful.`;
}
