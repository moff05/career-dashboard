import { NextRequest, NextResponse } from 'next/server';
import { getUserId, getApiKey } from '@/lib/user';
import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt } from '@/lib/ai-context';

export const maxDuration = 60;



export async function GET(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const apiKey = getApiKey(request);
    if (!apiKey) return NextResponse.json([], { status: 200 });
    const anthropic = new Anthropic({ apiKey });
    const systemPrompt = await buildSystemPrompt(userId);

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Generate 9 realistic job leads for Nicholas right now. Return ONLY valid JSON.

LOCATION CONSTRAINTS (strict):
- Internships (fall-2026-internship, spring-2027-internship, summer-internship): ONLY "Remote" or "Miami, FL"
- Full-time: ONLY "San Francisco, CA", "New York, NY", "Atlanta, GA", "Dallas, TX", or "Miami, FL"

Mix: 6 internships + 3 full-time. Vary companies across CRE tech, PropTech, AI/SaaS, enterprise software.

Return ONLY valid JSON:
{
  "leads": [
    {
      "company": "Real company name",
      "title": "Specific role title",
      "type": "fall-2026-internship | spring-2027-internship | summer-internship | full-time",
      "location": "Remote | Miami, FL | San Francisco, CA | New York, NY | Atlanta, GA | Dallas, TX",
      "fit_score": 8,
      "why": "One sharp sentence on why this fits Nicholas — reference his specific background (Goldenrod, StackingPlanner, n8n, Python, CRE)",
      "tags": ["Tag1", "Tag2", "Tag3"]
    }
  ]
}

Company mix ideas: CoStar, VTS, Procore, CBRE, JLL, RealPage, Buildout, Cherre, Reonomy, MRI Software, Yardi, Anthropic, Zapier, ServiceNow, Palantir, Qualtrics — but pick the best fits, not just this list.
Role ideas: PropTech Analyst, Business Technology Analyst, AI Product Intern, Solutions Engineering, CRE Data Analyst, Automation Engineer, Product Operations.
fit_score: honest 1-10 (mix of 6s, 7s, 8s — not everything 9-10).`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: 'Parse failed' }, { status: 500 });
    return NextResponse.json(JSON.parse(match[0]));
  } catch (error) {
    console.error('Suggestions error:', error);
    return NextResponse.json({ error: 'Suggestions failed' }, { status: 500 });
  }
}
