import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '@/lib/db';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface Job { title: string; company: string; }

export async function GET() {
  try {
    const db = getDb();
    const jobs = (await db.execute('SELECT title, company FROM jobs')).rows as unknown as Job[];
    const existingCompanies = [...new Set(jobs.map(j => j.company))].join(', ');

    const prompt = `You are a career advisor surfacing specific job leads for Nicholas Moffett. Give him 8-10 leads he hasn't already seen — different companies, mix of sizes and stages.

Candidate: Nicholas Moffett
- University of Miami Herbert Business School, junior (graduating May 2027), GPA 3.71
- Skills: Claude/OpenAI APIs, n8n automation, Python, CRE technology, Zapier, AI workflow automation
- Experience: Goldenrod Companies (AI workflow automation intern), co-founder N&S Digital/StackingPlanner.com SaaS, Eduply (AI prompt engineer), SK Commercial Realty
- Seeking: Fall 2026 internships, Spring 2027 internships, Full-time May 2027
- NO company size preference — startups, mid-size, and Fortune 500 all welcome
- INTERNSHIP LOCATIONS: Must be Remote or Miami, FL only (he's still in school). Full-time: SF, NYC, ATL, DFW, Miami, or international.

Companies already tracking (exclude): ${existingCompanies || 'none yet'}

Find leads across a wide range of verticals:
- PropTech/CRE tech (VTS, Procore, Buildout, RealPage, Yardi, CoStar, Crexi, Juniper Square, Altus, Cherre, etc.)
- AI/automation platforms (Make.com, Workato, Tray.io, Retool, Monday.com, Airtable, etc.)
- Real estate investment/iBuying tech (Opendoor, Compass, Offerpad, etc.)
- Construction tech (Autodesk Construction Cloud, Procore, PlanGrid, Fieldwire, etc.)
- Facility/property management tech (AppFolio, Buildium, ResMan, etc.)
- Tech at traditional CRE firms (Hines, Prologis, Brookfield, Nuveen Real Estate, etc.)
- PropTech VCs or accelerators (Fifth Wall, MetaProp, Navitas Capital, etc.)
- Any company with AI analyst/automation/solutions engineer/business tech roles

Return ONLY a valid JSON array:
[{
  "title": "specific realistic role title",
  "company": "specific real company name",
  "location": "city, state (or 'Remote')",
  "match_score": 7-10,
  "reason": "2 sentences: what the company does and why it's a fit for Nicholas specifically",
  "type": "fall-2026-internship" | "spring-2027-internship" | "full-time",
  "url": ""
}]

IMPORTANT: Internship location must always be "Remote" or "Miami, FL". Do not suggest on-site internships in other cities.
Be specific. Include a wide mix of company types — don't just list the usual suspects.`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '[]';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) return NextResponse.json(JSON.parse(jsonMatch[0]));
    return NextResponse.json([]);
  } catch (error) {
    console.error('GET /api/discover/suggestions error:', error);
    return NextResponse.json([]);
  }
}
