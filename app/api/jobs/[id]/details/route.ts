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
      company: string; title: string; type: string; location: string | null;
      description: string | null; salary_range: string | null;
    } | undefined;

    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const systemPrompt = await buildSystemPrompt();

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1200,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Break down this job for Nicholas and return a structured JSON analysis.

JOB:
Company: ${job.company}
Title: ${job.title}
Location: ${job.location || 'not specified'}
${job.description ? `Full Description:\n${String(job.description).slice(0, 6000)}` : '(No description — infer from company name and job title)'}

Return ONLY valid JSON, no other text:
{
  "company_overview": "2-3 sentences: what this company does, their scale/stage, why they matter — especially any connection to CRE, proptech, AI, or SaaS",
  "role_summary": "2-3 sentences: what this person actually does day-to-day in this role — be concrete, not generic",
  "key_qualifications": ["requirement 1", "requirement 2", "requirement 3", "requirement 4", "requirement 5"],
  "what_to_highlight": "2-3 sentences: exactly what Nicholas should lead with and emphasize for THIS specific role — reference his actual experience (Goldenrod AI automation, StackingPlanner SaaS, n8n/Zapier workflows, PropTech angle, Python, etc.) and how it maps to what this company needs"
}

For key_qualifications: extract 4-6 most important requirements from the JD. If no JD, infer the most likely requirements for this role/company type.
For what_to_highlight: be specific and tactical — this is prep advice, not generic encouragement.`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: 'Parse failed' }, { status: 500 });

    return NextResponse.json(JSON.parse(match[0]));
  } catch (error) {
    console.error('POST /api/jobs/[id]/details error:', error);
    return NextResponse.json({ error: 'Details generation failed' }, { status: 500 });
  }
}
