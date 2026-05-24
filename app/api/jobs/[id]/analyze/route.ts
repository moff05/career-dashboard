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
      description: string | null; salary_range: string | null; status: string;
    } | undefined;

    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const systemPrompt = await buildSystemPrompt();

    const typeLabel: Record<string, string> = {
      'fall-2026-internship': 'Fall 2026 Internship',
      'spring-2027-internship': 'Spring 2027 Internship',
      'summer-internship': 'Summer Internship',
      'full-time': 'Full-Time / New Grad',
    };

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 900,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Score this job opportunity for Nicholas across 5 categories, each 0–100. Be honest — don't inflate scores. Reference his specific background (Goldenrod n8n/AI workflows, StackingPlanner, SK Commercial, Eduply prompt engineering, Python, Zapier) where relevant.

JOB:
Company: ${job.company}
Title: ${job.title}
Type: ${typeLabel[job.type] || job.type}
Location: ${job.location || 'not specified'}
${job.description ? `Description:\n${job.description}` : '(No description — score based on company/title/type only)'}

SCORING CATEGORIES:
1. Industry Fit — alignment with CRE, proptech, AI automation (his strongest domains)
2. Skills Match — overlap between requirements and his stack: Python, n8n, Zapier, APIs, Excel, Claude, AI automation, SaaS tools
3. Role Alignment — match with his current search target and experience level
4. Location Match — Remote/Miami for internships; SF/NYC/ATL/DFW/Miami for full-time post-grad
5. Growth Potential — learning value, brand strength, career trajectory fit

Return ONLY valid JSON, no other text:
{
  "categories": [
    {"name": "Industry Fit", "score": 0, "rationale": "1-2 specific sentences"},
    {"name": "Skills Match", "score": 0, "rationale": "1-2 sentences"},
    {"name": "Role Alignment", "score": 0, "rationale": "1-2 sentences"},
    {"name": "Location Match", "score": 0, "rationale": "1-2 sentences"},
    {"name": "Growth Potential", "score": 0, "rationale": "1-2 sentences"}
  ],
  "total": 0,
  "summary": "One crisp sentence verdict"
}

total = simple average of all 5 scores, rounded to nearest integer.`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: 'Parse failed' }, { status: 500 });

    return NextResponse.json(JSON.parse(match[0]));
  } catch (error) {
    console.error('POST /api/jobs/[id]/analyze error:', error);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}
