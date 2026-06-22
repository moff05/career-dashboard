import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt } from '@/lib/ai-context';
import { getUserId, getApiKey } from '@/lib/user';
import { getDb } from '@/lib/db';
import { checkLiveness } from '@/lib/liveness';

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
  liveness_status: string;
}

async function ensureLeadsTable() {
  const db = getDb();
  await db.execute(`CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL DEFAULT 'anonymous',
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
    dismissed INTEGER DEFAULT 0,
    liveness_status TEXT NOT NULL DEFAULT 'unverified',
    liveness_checked_at TEXT
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
      { sql: 'SELECT target_roles, target_cities, notes FROM profile WHERE user_id = ?', args: [userId] }
    )).rows[0] as unknown as { target_roles?: string; target_cities?: string; notes?: string } | undefined;

    const targetRoles = profileRow?.target_roles?.trim() || '';
    const targetCities = profileRow?.target_cities?.trim() || '';
    const notes = profileRow?.notes?.trim() || '';

    const existingJobs = (await db.execute({ sql: 'SELECT company, title FROM jobs WHERE user_id = ?', args: [userId] })).rows as unknown as { company: string; title: string }[];
    const existingSet = new Set(
      existingJobs.map(j => `${j.company?.toLowerCase()}::${j.title?.toLowerCase()}`)
    );

    const systemPrompt = await buildSystemPrompt(userId);

    const huntPrompt = `You are a job search agent. Your ONLY job is to find real, currently open job postings with direct links the candidate (described in the system prompt) can click to apply.

Target roles: ${targetRoles || 'infer from the resume/profile in the system prompt'}
Target locations: ${targetCities || 'not specified — default to Remote, plus any location mentioned in their notes/resume'}
${notes ? `Additional constraints from their profile notes: ${notes}` : ''}

Run 5-6 targeted web searches to find actual open job listings matching the target roles and locations above. Use site: filters for major job boards (site:linkedin.com, site:greenhouse.io, site:lever.co, site:workday.com, site:handshake.com) and vary the searches across the different target roles and locations — don't run the same query 6 times. Example query shape: "<role> intern fall 2026 remote OR <city>" site:linkedin.com OR site:greenhouse.io

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
      "fit_reasoning": "1-2 sentences why this fits the candidate — reference specifics from their actual resume/background in the system prompt",
      "tags": ["2-3 relevant skill or domain tags"],
      "source_query": "which search found this"
    }
  ]
}

Additional rules:
- Respect the target locations above; if none given, prefer Remote and otherwise stay open
- Minimum fit_score 5 to include
- Maximum 15 leads, sorted by fit_score descending
- No duplicate companies/titles
- REPEAT: if there is no direct job posting URL, omit the lead entirely`;

    // No fallback to a plain (non-web-search) completion here on purpose — without
    // real search results, the model has nothing to ground a URL in but training
    // data, and would be guessing at a plausible-looking link that may not exist.
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
    const blocks = response.content as any[];
    const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('');

    // Ground every lead's URL in what web_search actually returned — the model's
    // final JSON answer isn't guaranteed to copy tool results verbatim, so a URL
    // that doesn't appear in any real search result is treated as unverified.
    const realUrls = new Set<string>();
    for (const block of blocks) {
      if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
        for (const result of block.content) {
          if (typeof result?.url === 'string') realUrls.add(result.url);
        }
      }
    }

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ leads: [] });

    let parsed: { leads?: HuntLead[] };
    try { parsed = JSON.parse(match[0]); } catch { return NextResponse.json({ leads: [] }); }

    const candidateLeads = (parsed.leads || []).filter((lead: HuntLead) => {
      const hasRealUrl = typeof lead.url === 'string' && realUrls.has(lead.url);
      const key = `${lead.company?.toLowerCase()}::${lead.title?.toLowerCase()}`;
      return hasRealUrl && !existingSet.has(key) && lead.company && lead.title;
    });

    // Web-search grounding proves a URL was a real search result, not that the
    // posting is still live today. Check each candidate's URL and drop anything
    // confirmed dead before it ever reaches the leads table — leads that time out
    // or get blocked by anti-bot walls are kept as 'unverified', not penalized.
    const livenessResults = await Promise.allSettled(
      candidateLeads.map((lead: HuntLead) => checkLiveness(lead.url as string))
    );
    const newLeads = candidateLeads
      .map((lead: HuntLead, i: number) => ({
        lead,
        liveness: livenessResults[i].status === 'fulfilled' ? livenessResults[i].value : 'unverified',
      }))
      .filter(({ liveness }) => liveness !== 'dead');

    const checkedAt = new Date().toISOString();

    await db.execute({ sql: 'DELETE FROM leads WHERE dismissed = 0 AND user_id = ?', args: [userId] });

    for (const { lead, liveness } of newLeads) {
      await db.execute({
        sql: `INSERT INTO leads (user_id, company, title, url, location, type, fit_score, fit_reasoning, tags, source_query, liveness_status, liveness_checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          userId,
          lead.company || '',
          lead.title || '',
          lead.url || null,
          lead.location || '',
          lead.type || 'full-time',
          Number(lead.fit_score) || 0,
          lead.fit_reasoning || '',
          JSON.stringify(Array.isArray(lead.tags) ? lead.tags : []),
          lead.source_query || '',
          liveness,
          checkedAt,
        ],
      });
    }

    const rows = (await db.execute({
      sql: 'SELECT * FROM leads WHERE dismissed = 0 AND user_id = ? ORDER BY fit_score DESC',
      args: [userId],
    })).rows as unknown as DBLead[];

    return NextResponse.json({
      leads: rows.map(r => ({ ...r, tags: parseTags(r.tags) })),
    });
  } catch (error) {
    console.error('Hunt error:', error);
    return NextResponse.json({ error: 'Hunt failed', leads: [] }, { status: 500 });
  }
}
