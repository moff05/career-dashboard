import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '@/lib/db';
import { buildSystemPrompt } from '@/lib/ai-context';

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TONE_INSTRUCTIONS: Record<string, string> = {
  professional: 'professional and polished — formal but warm, demonstrates competence and enthusiasm',
  confident:    'confident and direct — assertive claims, lead with achievements, no hedging language',
  concise:      'concise and punchy — max 3 tight paragraphs, every sentence earns its place, no filler',
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { tone = 'professional' } = await request.json().catch(() => ({}));
    const db = getDb();
    const job = (await db.execute({ sql: 'SELECT * FROM jobs WHERE id = ?', args: [parseInt(id)] })).rows[0] as unknown as {
      company: string; title: string; location: string | null; description: string | null;
    } | undefined;

    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const systemPrompt = await buildSystemPrompt();
    const toneInstruction = TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.professional;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Write a tailored cover letter for Nicholas for this role. Tone: ${toneInstruction}.

JOB:
Company: ${job.company}
Title: ${job.title}
Location: ${job.location || 'not specified'}
${job.description ? `Full JD:\n${String(job.description).slice(0, 6000)}` : '(No JD — use company name and role to infer context)'}

RULES:
- Open with "Dear Hiring Team,"
- Strong hook: connect Nicholas's most relevant experience to THIS company's specific needs — not generic
- Body: concrete examples from his background — use what's most relevant to this role (Goldenrod AI automation, StackingPlanner SaaS, n8n/Zapier, Python, CRE angle)
- Close: confident, brief, clear call to action
- Sign off: "Sincerely,\nNicholas Moffett\nnicmoffett5@gmail.com | (470) 421-5955 | linkedin.com/in/nicholas-moffett"
- NEVER use: "I am writing to express my interest", "I believe I would be a great fit", "I am passionate about"
- Output the letter text only — no subject line, no commentary`,
      }],
    });

    const letter = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    return NextResponse.json({ letter, tone });
  } catch (error) {
    console.error('Cover letter error:', error);
    return NextResponse.json({ error: 'Cover letter generation failed' }, { status: 500 });
  }
}
