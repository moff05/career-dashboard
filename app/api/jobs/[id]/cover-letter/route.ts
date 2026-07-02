import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { buildSystemPrompt } from '@/lib/ai-context';
import { getUserId, isSystemUser } from '@/lib/user';
import { logUsage } from '@/lib/usage';
import { getModel, geminiUsage, GEMINI_MODEL } from '@/lib/groq';
import { isRateLimited, RATE_LIMIT_RESPONSE } from '@/lib/rateLimit';

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
    if (await isRateLimited(userId)) return NextResponse.json(RATE_LIMIT_RESPONSE, { status: 429 });
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
    const { client, systemInstruction } = getModel(systemPrompt);
    const toneInstruction = TONE_INSTRUCTIONS[tone] || TONE_INSTRUCTIONS.professional;

    const prompt = `Write a tailored cover letter for this candidate applying to this role, and extract ATS keywords from the job description.

Tone: ${toneInstruction}.
JOB: Company: ${job.company} | Title: ${job.title} | Location: ${job.location || 'not specified'}
${job.description ? `JD:\n${String(job.description).slice(0, 6000)}` : '(No JD — tailor based on role title and company)'}
${angle ? `CANDIDATE'S ANGLE: ${angle}` : ''}

Letter structure (3 paragraphs):
1. Opening: Start with a specific, compelling hook — a result, insight, or connection to the company's work. Do NOT open with "I am writing", "I am excited", "I believe I would be", or "I am passionate about". Do NOT open with "I" at all.
2. Middle: Connect 2-3 of the candidate's strongest relevant experiences directly to what this role needs. Use specific details from the resume — not generic claims. Naturally weave in 3-5 of the extracted keywords.
3. Closing: Express clear interest, reference a specific next step, and close confidently. Keep it to 2-3 sentences.

Rules:
- Total letter length: 250-350 words
- Never invent facts not in the resume or context
- Mirror the JD's language where it fits naturally — don't force every keyword in
- Close with: candidate's name on one line, then any contact details (email, phone, LinkedIn) that appear in the context — only what's actually there, never invented

Keywords: Extract 8-12 specific skills, tools, or phrases from the JD that an ATS would scan for. Prefer exact phrases over generic terms.

Return ONLY valid JSON, no other text:
{"keywords":["keyword1","keyword2"],"letter":"full letter text here"}`;

    const response = await client.chat.completions.create({
      model: GEMINI_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        ...(systemInstruction ? [{ role: 'system' as const, content: systemInstruction }] : []),
        { role: 'user' as const, content: prompt },
      ],
    });
    await logUsage(userId, 'cover_letter', GEMINI_MODEL, geminiUsage(response.usage));
    const rawText = response.choices[0]?.message?.content || '{}';
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
