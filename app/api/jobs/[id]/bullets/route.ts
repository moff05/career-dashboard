import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { buildSystemPrompt } from '@/lib/ai-context';
import { getUserId, isSystemUser } from '@/lib/user';
import { logUsage } from '@/lib/usage';
import { getModel, geminiUsage, GEMINI_MODEL } from '@/lib/gemini';

export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = getUserId(request);
    if (isSystemUser(userId)) return NextResponse.json({ error: 'Not available' }, { status: 403 });
    const { id } = await params;
    const db = getDb();
    const job = (await db.execute({ sql: 'SELECT * FROM jobs WHERE id = ? AND user_id = ?', args: [parseInt(id), userId] })).rows[0] as unknown as {
      company: string; title: string; description: string | null;
    } | undefined;
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const systemPrompt = await buildSystemPrompt(userId);
    const { client, systemInstruction } = getModel(systemPrompt);

    const prompt = `You are a resume expert who tailors bullet points to specific job postings. Given a candidate's resume (in context) and a job description, produce resume tailoring advice.

JOB: Company: ${job.company} | Title: ${job.title}
${job.description ? `JD:\n${String(job.description).slice(0, 6000)}` : '(No JD provided — tailor based on role title and company)'}

Rules for strong resume bullets:
- Start with a strong action verb (Led, Built, Designed, Reduced, Increased, Automated, etc.)
- Include a specific metric or outcome where possible (%, $, count, time saved)
- Keep each bullet under 20 words
- Mirror language directly from the JD when it fits naturally

Produce:
1. "lead_with": The 2 experiences from the candidate's resume most relevant to this specific role. For each, explain why it's the strongest fit signal.
2. "tailored_bullets": Up to 4 existing resume bullets that should be rewritten to better match this JD. For each: show the original, the tailored version, and a one-sentence explanation of what changed and why.
3. "keywords_to_add": 6-10 specific keywords or phrases from the JD that are missing from the resume but could be added authentically.
4. "deprioritize": Up to 2 resume sections or experiences that are least relevant to this role and should be moved down or cut to make room.

Return ONLY valid JSON, no other text:
{"lead_with":[{"experience":"name of the experience/role","why":"why it's the strongest fit signal"}],"tailored_bullets":[{"original":"original bullet text","tailored":"rewritten bullet","why":"what changed and why"}],"keywords_to_add":["keyword1","keyword2"],"deprioritize":["section or experience to deprioritize"]}`;

    const response = await client.chat.completions.create({
      model: GEMINI_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        ...(systemInstruction ? [{ role: 'system' as const, content: systemInstruction }] : []),
        { role: 'user' as const, content: prompt },
      ],
    });
    await logUsage(userId, 'resume_bullets', GEMINI_MODEL, geminiUsage(response.usage));
    const text = response.choices[0]?.message?.content || '{}';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: 'Parse failed' }, { status: 500 });
    const parsed = JSON.parse(match[0]);
    await db.execute({
      sql: 'UPDATE jobs SET bullets_data = ? WHERE id = ? AND user_id = ?',
      args: [JSON.stringify(parsed), parseInt(id), userId],
    });
    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Bullets error:', error);
    return NextResponse.json({ error: 'Bullets analysis failed' }, { status: 500 });
  }
}
