import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt } from '@/lib/ai-context';

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function GET() {
  try {
    const systemPrompt = await buildSystemPrompt();
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Generate my weekly career brief for ${today}. Be specific, honest, and actionable — use what you know about my actual background, the jobs I've tracked, and my goals.

Return ONLY a valid JSON object:
{
  "headline": <string: one direct sentence about where Nicholas stands right now in his job search>,
  "priority_actions": [
    { "action": <string: concrete specific action>, "urgency": <"today" | "this-week" | "soon">, "reason": <string: why this matters now> }
  ],
  "recommended_roles": [
    { "title": <string: specific role title>, "why": <string: 1 sentence why it fits Nicholas specifically>, "example_companies": [<3 real company names that hire for this>] }
  ],
  "this_week_focus": <string: 2-3 sentences on exactly what Nicholas should focus on this week>,
  "honest_assessment": <string: 2-3 honest sentences about his competitiveness for target roles and what he must work on>
}`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return NextResponse.json({ ...JSON.parse(jsonMatch[0]), generated_at: new Date().toISOString() });
    }
    return NextResponse.json({ error: 'Failed to parse brief' }, { status: 500 });
  } catch (error) {
    console.error('GET /api/brief error:', error);
    return NextResponse.json({ error: 'Brief generation failed' }, { status: 500 });
  }
}
