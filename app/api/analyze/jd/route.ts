import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt } from '@/lib/ai-context';
import { getApiKey } from '@/lib/user';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const apiKey = getApiKey(request);
    if (!apiKey) return NextResponse.json({ error: 'API key required' }, { status: 401 });
    const anthropic = new Anthropic({ apiKey });
    const { jd } = await request.json();
    if (!jd?.trim()) return NextResponse.json({ error: 'No job description provided' }, { status: 400 });

    const systemPrompt = await buildSystemPrompt('anonymous');

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Analyze this job description and honestly assess how well Nicholas fits it. Be direct — if it's a stretch or a mismatch, say so.

JOB DESCRIPTION:
${jd}

Return ONLY a valid JSON object with this exact shape:
{
  "fit_score": <integer 1-10>,
  "verdict": <"Strong Match" | "Good Fit" | "Stretch" | "Not a Match">,
  "what_you_have": [<array of 3-6 specific matching qualifications as concise strings>],
  "what_you_lack": [<array of 0-4 honest gaps as concise strings, empty array if none significant>],
  "how_to_position": <string: 2-3 sentences on exactly how Nicholas should frame his application for this specific role>,
  "should_apply": <boolean>,
  "role_type": <string: best label for this role type, e.g. "PropTech Analyst" or "AI Solutions Engineer">,
  "top_keywords": [<array of 4-6 key skills/terms from the JD Nicholas should mirror in his resume and cover letter>]
}`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return NextResponse.json(JSON.parse(jsonMatch[0]));
    return NextResponse.json({ error: 'Failed to parse analysis' }, { status: 500 });
  } catch (error) {
    console.error('POST /api/analyze/jd error:', error);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}
