import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt } from '@/lib/ai-context';
import { getUserId, getApiKey } from '@/lib/user';

export const maxDuration = 60;



const PROMPT = (query: string) => `Research "${query}" for the candidate described in the system prompt and return a structured JSON analysis.

Return ONLY valid JSON, no other text:
{
  "company": "exact company name (or best match for the query)",
  "what_they_do": "2-3 sentences: what this company does, who they serve, why they matter",
  "size": "approximate headcount range, e.g. '500-1,000 employees' or 'Unknown'",
  "stage": "e.g. 'Series C startup', 'Public company', 'Late-stage', 'Enterprise'",
  "culture_signals": ["signal 1", "signal 2", "signal 3"],
  "roles": [
    {
      "title": "role title",
      "location": "city or 'Remote'",
      "type": "fall-2026-internship | spring-2027-internship | summer-internship | full-time"
    }
  ],
  "fit_score": 7,
  "fit_verdict": "Strong Match | Good Fit | Stretch | Not a Match",
  "fit_reasoning": "2-3 sentences: why this company/role aligns or doesn't align with the candidate's background",
  "your_angle": "1-2 sentences: exactly how the candidate should position themselves — specific to this company",
  "caveat": "one sentence about anything to verify (e.g. 'Confirm current openings on their careers page')"
}

For roles: list 3-5 real, entry-level roles that this company actually hires for (internships + new grad). Use real job titles this company has posted historically. Do not invent titles. Omit any role you are not confident this company actually recruits for.
For fit_score: 1-10 — honest assessment based on the candidate's actual background and skills from the system prompt. Do not assume any specific industry or major unless their resume/profile says so.
For fit_verdict: Strong Match (8-10), Good Fit (6-7), Stretch (4-5), Not a Match (<4).`;

export async function POST(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const apiKey = getApiKey(request);
    if (!apiKey) return NextResponse.json({ error: 'API key required' }, { status: 401 });
    const anthropic = new Anthropic({ apiKey });
    const { query } = await request.json();
    if (!query?.trim()) return NextResponse.json({ error: 'Query required' }, { status: 400 });

    const systemPrompt = await buildSystemPrompt(userId);
    const userContent = PROMPT(query.trim());
    let text = '';

    // Try with web search first
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (anthropic.beta.messages as any).create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        betas: ['web-search-2025-03-05'],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: [{ type: 'web_search_20250305' as any, name: 'web_search' }],
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      });
      // Extract text blocks from the response
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      text = (response.content as any[])
        .filter((b: { type: string }) => b.type === 'text')
        .map((b: { text: string }) => b.text)
        .join('');
    } catch {
      // Fallback: knowledge-only with Haiku
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      });
      text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    }

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: 'Parse failed' }, { status: 500 });
    return NextResponse.json(JSON.parse(match[0]));
  } catch (error) {
    console.error('Research error:', error);
    return NextResponse.json({ error: 'Research failed' }, { status: 500 });
  }
}
