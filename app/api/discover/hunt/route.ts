import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt } from '@/lib/ai-context';
import { getDb } from '@/lib/db';

export const maxDuration = 120;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface HuntLead {
  company?: string; title?: string; url?: string | null; location?: string;
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

export async function POST() {
  try {
    const db = await ensureLeadsTable();

    const profileRow = (await db.execute(
      'SELECT target_roles, target_cities FROM profile WHERE id = 1'
    )).rows[0] as unknown as { target_roles?: string; target_cities?: string } | undefined;

    const targetRoles = profileRow?.target_roles
      || 'PropTech Analyst, AI Product Manager, Business Technology Analyst, Solutions Engineer';
    const targetCities = profileRow?.target_cities
      || 'San Francisco, New York City, Atlanta, Dallas-Fort Worth, Miami';
    const topCities = targetCities.split(',').slice(0, 3).map(c => c.trim()).join(', ');

    const existingJobs = (await db.execute('SELECT company, title FROM jobs')).rows as unknown as { company: string; title: string }[];
    const existingSet = new Set(
      existingJobs.map(j => `${j.company?.toLowerCase()}::${j.title?.toLowerCase()}`)
    );

    const systemPrompt = await buildSystemPrompt();

    const huntPrompt = `You are actively hunting for real, currently open job postings for Nicholas. Use web_search to find actual job listings on LinkedIn, Greenhouse, Lever, Workday, Handshake, and company career pages.

Run 5-6 targeted searches:
1. Fall 2026 internship PropTech CRE technology analyst Remote OR Miami
2. Fall 2026 internship AI automation product SaaS operations Remote OR Miami
3. Fall 2026 internship business technology solutions engineer enterprise Remote OR Miami
4. Spring 2027 internship technology analyst CRE proptech Remote OR Miami
5. New grad 2025 2026 entry level PropTech analyst full-time ${topCities}
6. New grad entry level AI product business technology analyst full-time ${topCities}

Nicholas is looking for: ${targetRoles}

After all searches, return ONLY valid JSON (no other text before or after):
{
  "leads": [
    {
      "company": "Exact company name from the posting",
      "title": "Exact job title from the posting",
      "url": "Direct URL to the job posting or null",
      "location": "City, ST or Remote",
      "type": "fall-2026-internship | spring-2027-internship | summer-internship | full-time",
      "fit_score": 8,
      "fit_reasoning": "1-2 sentences: why this fits Nicholas — reference his Goldenrod CRE internship, StackingPlanner SaaS, n8n/Zapier automation, Python, AI tools background",
      "tags": ["PropTech", "AI", "Python"],
      "source_query": "brief label of which search found this"
    }
  ]
}

RULES:
- ONLY include postings found via web search — never invent jobs
- Internships: ONLY Remote or Miami, FL (Nicholas is at University of Miami, cannot relocate for internships)
- Full-time: ONLY San Francisco, New York, Atlanta, Dallas, or Miami
- Only include if fit_score >= 5 (be honest — not every role is a 9/10)
- Maximum 15 leads, sorted by fit_score descending
- No duplicate companies/titles`;

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
      const key = `${lead.company?.toLowerCase()}::${lead.title?.toLowerCase()}`;
      return !existingSet.has(key) && lead.company && lead.title;
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
