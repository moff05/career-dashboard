import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '@/lib/db';
import { buildSystemPrompt } from '@/lib/ai-context';
import { getUserId, getApiKey } from '@/lib/user';

export const maxDuration = 60;

const TONE_INSTRUCTIONS: Record<string, string> = {
  professional: 'professional and polished — formal but warm, demonstrates competence and enthusiasm',
  confident:    'confident and direct — assertive claims, lead with achievements, no hedging language',
  concise:      'concise and punchy — max 3 tight paragraphs, every sentence earns its place, no filler',
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = getUserId(request);
    const apiKey = getApiKey(request);
    if (!apiKey) return NextResponse.json({ error: 'API key required' }, { status: 401 });
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const tone = body.tone || 'professional';
    const angle = typeof body.angle === 'string' ? body.angle.trim().slice(0, 300) : '';
    const db = getDb();
    const job = (await db.execute({ sql: 'SELECT * FROM jobs WHERE id = ? AND user_id = ?', args: [parseInt(id), userId] })).rows[0] as unknown as {
      company: string; title: string; location: string | null; description: string | null;
    } | undefined;
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const anthropic = new Anthropic({ apiKey });
    const systemPrompt = await buildSystemPrompt(userId);
    const toneInstruction = TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.professional;
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 1800, system: systemPrompt,
      messages: [{ role: 'user', content: `Write a tailored cover letter for this role, AND extract 8-10 ATS keywords/phrases from the job description.

Tone: ${toneInstruction}.
JOB: Company: ${job.company} | Title: ${job.title} | Location: ${job.location || 'not specified'}
${job.description ? `JD:\n${String(job.description).slice(0, 6000)}` : '(No JD)'}
${angle ? `CANDIDATE'S ANGLE ON WHY THIS ROLE: ${angle}` : ''}

Open the letter with "Dear Hiring Team,". Never use: "I am writing to express my interest", "I believe I would be a great fit", "I am passionate about". Mirror several of the extracted keywords naturally in the letter body — don't force all of them in if it reads unnaturally.

Return ONLY valid JSON, no other text:
{
  "keywords": ["keyword1", "keyword2", "..."],
  "letter": "full cover letter text here"
}` }],
    });
    const rawText = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    let letter = '';
    let keywords: string[] = [];
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        letter = typeof parsed.letter === 'string' ? parsed.letter.trim() : '';
        keywords = Array.isArray(parsed.keywords) ? parsed.keywords.filter((k: unknown) => typeof k === 'string') : [];
      } catch { /* fall through to plain-text fallback below */ }
    }
    if (!letter) letter = rawText.trim();
    return NextResponse.json({ letter, keywords, tone });
  } catch (error) {
    console.error('Cover letter error:', error);
    return NextResponse.json({ error: 'Cover letter generation failed' }, { status: 500 });
  }
}
