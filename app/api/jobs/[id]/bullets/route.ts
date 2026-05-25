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
      max_tokens: 1400,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Give Nicholas specific resume tailoring advice for this job. Return ONLY valid JSON.

JOB:
Company: ${job.company}
Title: ${job.title}
${job.description ? `Full JD:\n${String(job.description).slice(0, 6000)}` : '(No JD — infer from company/role)'}

Return ONLY valid JSON, no other text:
{
  "lead_with": [
    {
      "experience": "experience or project name",
      "why": "one sentence on why this is the strongest card for THIS specific role"
    }
  ],
  "tailored_bullets": [
    {
      "original": "close approximation of the original resume bullet",
      "tailored": "rewritten version optimized for this role — stronger verb, relevant framing, quantified where possible",
      "why": "one sentence explaining what changed and why it lands better for this role"
    }
  ],
  "keywords_to_add": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "deprioritize": ["item that should be buried or cut for this application"]
}

For lead_with: 2-3 experiences/projects that should anchor his resume for this role.
For tailored_bullets: rewrite 3-4 real bullets from his resume to be more relevant to this specific JD.
For keywords_to_add: ATS-relevant keywords from the JD to weave in naturally.
For deprioritize: 1-2 items that waste resume real estate or hurt fit signal for this role.`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: 'Parse failed' }, { status: 500 });
    return NextResponse.json(JSON.parse(match[0]));
  } catch (error) {
    console.error('Bullets error:', error);
    return NextResponse.json({ error: 'Bullets analysis failed' }, { status: 500 });
  }
}
