import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { buildSystemPrompt } from '@/lib/ai-context';
import { getUserId, isSystemUser } from '@/lib/user';
import { logUsage } from '@/lib/usage';
import { getModel, geminiUsage, GEMINI_MODEL } from '@/lib/gemini';

export const maxDuration = 60;

const TONE_INSTRUCTIONS: Record<string, string> = {
  professional: 'professional and polished — formal but warm, demonstrates competence and enthusiasm',
  confident:    'confident and direct — assertive claims, lead with achievements, no hedging language',
  concise:      'concise and punchy — max 3 tight paragraphs, every sentence earns its place, no filler',
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = getUserId(request);
    if (isSystemUser(userId)) return NextResponse.json({ error: 'Not available' }, { status: 403 });
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const tone = body.tone || 'professional';
    const angle = typeof body.angle === 'string' ? body.angle.trim().slice(0, 300) : '';
    const db = getDb();
    const job = (await db.execute({ sql: 'SELECT * FROM jobs WHERE id = ? AND user_id = ?', args: [parseInt(id), userId] })).rows[0] as unknown as {
      company: string; title: string; location: string | null; description: string | null;
    } | undefined;
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const systemPrompt = await buildSystemPrompt(userId);
    const model = getModel(systemPrompt);
    const toneInstruction = TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.professional;
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `Write a tailored cover letter for this role, AND extract 8-10 ATS keywords/phrases from the job description.

Tone: ${toneInstruction}.
JOB: Company: ${job.company} | Title: ${job.title} | Location: ${job.location || 'not specified'}
${job.description ? `JD:\n${String(job.description).slice(0, 6000)}` : '(No JD)'}
${angle ? `CANDIDATE'S ANGLE ON WHY THIS ROLE: ${angle}` : ''}

Open the letter with "Dear Hiring Team,". Never use: "I am writing to express my interest", "I believe I would be a great fit", "I am passionate about". Mirror several of the extracted keywords naturally in the letter body — don't force all of them in if it reads unnaturally. Close with a signature: the candidate's name, and beneath it whichever contact details (email, phone, LinkedIn) are listed in the context above — only the ones actually given, never invented.

Return ONLY valid JSON, no other text:
{
  "keywords": ["keyword1", "keyword2", "..."],
  "letter": "full cover letter text here"
}` }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    });
    await logUsage(userId, 'cover_letter', GEMINI_MODEL, geminiUsage(result.response.usageMetadata));
    const rawText = result.response.text();
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
    await db.execute({
      sql: 'UPDATE jobs SET cover_letter_data = ? WHERE id = ? AND user_id = ?',
      args: [JSON.stringify({ letter, keywords, tone }), parseInt(id), userId],
    });
    return NextResponse.json({ letter, keywords, tone });
  } catch (error) {
    console.error('Cover letter error:', error);
    return NextResponse.json({ error: 'Cover letter generation failed' }, { status: 500 });
  }
}
