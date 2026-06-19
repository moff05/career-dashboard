import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt } from '@/lib/ai-context';
import { getUserId, getApiKey } from '@/lib/user';
import { getDb } from '@/lib/db';

export const maxDuration = 120;



interface HuntLead {
  company?: string; title?: string; url?: string; location?: string;
  type?: string; fit_score?: number | string; fit_reasoning?: string;
  tags?: string[]; source_query?: string;
}
interface DBLead {
  id: number; company: string; title: string; url: string | null; location: string;
  type: string; fit_score: number; fit_reasoning: string; tags: string;
  source_query: string; created_at: string; dismissed: number;
}

async function ensureLeadsTable() {
  const db = getDb();
  await db.execute(`CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT,
    location TEXT,
    type TEXT,
    fit_score REAL DEFAULT 0,
    fit_reasoning TEXT,
    tags TEXT DEFAULT '[]',
    source_query TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    dismissed INTEGER DEFAULT 0
  )`);
  return db;
}

function parseTags(v: string | null | undefined): string[] {
  try { return JSON.parse(v || '[]'); } catch { return []; }
}

export async function POST(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const apiKey = getApiKey(request);
    if (!apiKey) return NextResponse.json({ error: 'API key required' }, { status: 401 });
    const anthropic = new Anthropic({ apiKey });
    const db = await ensureLeadsTable();

    const profileRow = (await db.execute(
      { sql: 'SELECT target_roles, target_cities FROM profile WHERE user_id = ?', args: [userId] }
    )).rows[0] as unknown as { target_roles?: string; target_cities?: string } | undefined;

    const targetRoles = profileRow?.target_roles
      || 'PropTech Analyst, AI Product Manager, Business Technology Analyst, Solutions Engineer';
    const targetCities = profileRow?.target_cities
      || 'San Francisco, New York City, Atlanta, Dallas-Fort Worth, Miami';
    const topCities = targetCities.split(',').slice(0, 3).map(c => c.trim()).join(', ');

    const existingJobs = (await db.execute({ sql: 'SELECT company, title FROM jobs WHERE user_id = ?', args: [userId] })).rows as unknown as { company: string; title: string }[];
    const existingSet = new Set(
      existingJobs.map(j => `${j.company?.toLowerCase()}::${j.title?.toLowerCase()}`)
    );

    const systemPrompt = await buildSystemPrompt(userId);

    const huntPrompt = `You are a job search agent. Your ONLY job is to find real, currently open job postings with direct links Nicholas can click to apply.

Run these 6 web searches to find actual job listings:
1. "fall 2026 internship proptech analyst remote" site:linkedin.com OR site:greenhouse.io OR site:lever.co
2. "fall 2026 intern AI product operations SaaS remote OR miami" site:linkedin.com OR site:handshake.com
3. "business technology analyst intern 2026 remote" site:greenhouse.io OR site:lever.co OR site:workday.com
4. "solutions engineer intern fall 2026 remote OR miami" site:linkedin.com OR site:greenhouse.io
5. "proptech analyst new grad 2026 entry level ${topCities}" site:linkedin.com OR site:greenhouse.io
6. "CRE technology analyst entry level full time 2026 ${topCities}" site:linkedin.com OR site:lever.co

Nicholas is looking for: ${targetRoles}

ABSOLUTE REQUIREMENTS — violating these means the lead is worthless:
1. Every single lead MUST have a "url" field containing the actual URL of that job posting page from your search results
2. The URL must go directly to the job listing (linkedin.com/jobs/view/..., boards.greenhouse.io/..., jobs.lever.co/..., etc.)
3. If you found a company but could not find the specific job posting URL, DO NOT include that lead
4. Do NOT use training data knowledge to generate leads — every lead must come from what you found in web search results
5. Only include jobs posted in 2025 or later (currently open)

Return ONLY valid JSON, nothing else:
{
  "leads": [
    {
      "company": "Exact company name from the job posting",
      "title": "Exact job title from the posting",
      "url": "https://... full URL to the specific job listing page",
      "location": "City, ST or Remote",
      "type": "fall-2026-internship | spring-2027-internship | summer-internship | full-time",
      "fit_score": 8,
      "fit_reasoning": "1-2 sentences why this fits Nicholas — reference his Goldenrod CRE internship, StackingPlanner SaaS, n8n/Zapier automation, Python, AI tools background specifically",
      "tags": ["PropTech", "AI", "Python"],
      "source_query": "which of the 6 searches above found this"
    }
  ]
}

Additional rules:
- Internships: ONLY Remote or Miami, FL (Nicholas is at University of Miami, cannot relocate)
- Full-time: ONLY San Francisco, New York, Atlanta, Dallas, or Miami
- Minimum fit_score 5 to include
- Maximum 15 leads, sorted by fit_score descending
- No duplicate companies/titles
- REPEAT: if there is no direct job posting URL, omit the lead entirely`;

    let text = '';

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (anthropic.beta.messages as any).create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        betas: ['web-search-2025-03-05'],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: [{ type: 'web_search_20250305' as any, name: 'web_search' }],
        system: systemPrompt,
        messages: [{ role: 'user', content: huntPrompt }],
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      text = (response.content as any[])
        .filter((b: { type: string }) => b.type === 'text')
        .map((b: { text: string }) => b.text)
        .join('');
    } catch {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: 'user', content: huntPrompt }],
      });
      text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    }

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ leads: [] });

    let parsed: { leads?: HuntLead[] };
    try { parsed = JSON.parse(match[0]); } catch { return NextResponse.json({ leads: [] }); }

    const newLeads = (parsed.leads || []).filter((lead: HuntLead) => {
      const hasUrl = typeof lead.url === 'string' && lead.url.startsWith('http') && lead.url.includes('.');
      const key = `${lead.company?.toLowerCase()}::${lead.title?.toLowerCase()}`;
      return hasUrl && !existingSet.has(key) && lead.company && lead.title;
    });

    await db.execute('DELETE FROM leads WHERE dismissed = 0');

    for (const lead of newLeads) {
      await db.execute({
        sql: `INSERT INTO leads (company, title, url, location, type, fit_score, fit_reasoning, tags, source_query) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          lead.company || '',
          lead.title || '',
          lead.url || null,
          lead.location || '',
          lead.type || 'full-time',
          Number(lead.fit_score) || 0,
          lead.fit_reasoning || '',
          JSON.stringify(Array.isArray(lead.tags) ? lead.tags : []),
          lead.source_query || '',
        ],
      });
    }

    const rows = (await db.execute(
      'SELECT * FROM leads WHERE dismissed = 0 ORDER BY fit_score DESC'
    )).rows as unknown as DBLead[];

    return NextResponse.json({
      leads: rows.map(r => ({ ...r, tags: parseTags(r.tags) })),
    });
  } catch (error) {
    console.error('Hunt error:', error);
    return NextResponse.json({ error: 'Hunt failed', leads: [] }, { status: 500 });
  }
}
