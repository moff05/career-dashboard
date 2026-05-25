import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '@/lib/db';
import { buildSystemPrompt } from '@/lib/ai-context';

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getDb();
    const job = (await db.execute({ sql: 'SELECT * FROM jobs WHERE id = ?', args: [parseInt(id)] })).rows[0] as unknown as {
      company: string; title: string; description: string | null;
    } | undefined;

    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const systemPrompt = await buildSystemPrompt();

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Analyze fit gaps and positioning for Nicholas for this specific job. Return ONLY valid JSON.

JOB:
Company: ${job.company}
Title: ${job.title}
${job.description ? `Full JD:\n${String(job.description).slice(0, 6000)}` : '(No JD — infer from company/role)'}

Return ONLY valid JSON, no other text:
{
  "gaps": [
    {
      "skill": "specific skill or qualification",
      "severity": "major",
      "how_to_address": "specific tactical advice — how Nicholas can address, bridge, or reframe this gap in his application"
    }
  ],
  "positioning": "2-3 sentences: exactly how Nicholas should frame his overall narrative for THIS company — what angle makes him most compelling vs. other candidates",
  "quick_wins": ["concrete action 1", "concrete action 2", "concrete action 3"],
  "should_apply": true,
  "apply_reasoning": "one sentence on whether to apply now, wait, or skip"
}

For gaps: 3-5 real gaps between his background and this role. severity must be "major" or "minor". Be honest.
For positioning: be specific to this company — not generic advice about his background.
For quick_wins: things he can do in the next 1-2 weeks to strengthen candidacy specifically for this role.`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: 'Parse failed' }, { status: 500 });
    return NextResponse.json(JSON.parse(match[0]));
  } catch (error) {
    console.error('Gaps error:', error);
    return NextResponse.json({ error: 'Gaps analysis failed' }, { status: 500 });
  }
}
