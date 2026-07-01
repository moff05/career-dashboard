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

    const prompt = `You are a blunt career advisor. Analyze the fit gaps between this candidate (resume and background in context) and this specific job posting. Be honest — if there are hard disqualifiers, say so plainly.

JOB: Company: ${job.company} | Title: ${job.title}
${job.description ? `JD:\n${String(job.description).slice(0, 6000)}` : '(No JD — base analysis on role title and company)'}

Definitions:
- "major" gap: A requirement the posting explicitly lists that the candidate clearly lacks. Recruiters will notice this immediately.
- "minor" gap: Something that would strengthen the application but isn't a stated requirement.
- "how_to_address": Be specific and actionable. "Take an online course" is too vague. Say which course, certification, or project would close the gap and how long it realistically takes.

Rules for should_apply:
- FALSE when there is a hard structural disqualifier: wrong graduation year, missing required credential, location/visa conflict, explicitly required years of experience the candidate doesn't have. Strong skills do NOT override a hard gate.
- TRUE only when the candidate legitimately clears all stated requirements, or there is exactly one ambiguous blocker a single action could resolve.
- apply_reasoning: State plainly why you chose true or false. If false, name the disqualifier and why it can't be worked around.

"positioning": 2-3 sentences on the strongest angle this candidate should lead with in their application. What's their best argument for why they're the right person?

"quick_wins": Up to 3 specific things the candidate can do in the next 48 hours to strengthen this application (e.g., add a specific project to resume, get a referral, highlight a specific experience in cover letter).

Return ONLY valid JSON, no other text:
{"gaps":[{"skill":"specific gap name","severity":"major or minor","how_to_address":"specific actionable step"}],"positioning":"2-3 sentences on strongest angle","quick_wins":["specific action 1","specific action 2"],"should_apply":true,"apply_reasoning":"direct explanation"}`;

    const response = await client.chat.completions.create({
      model: GEMINI_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        ...(systemInstruction ? [{ role: 'system' as const, content: systemInstruction }] : []),
        { role: 'user' as const, content: prompt },
      ],
    });
    await logUsage(userId, 'fit_gaps', GEMINI_MODEL, geminiUsage(response.usage));
    const text = response.choices[0]?.message?.content || '{}';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: 'Parse failed' }, { status: 500 });
    const parsed = JSON.parse(match[0]);
    await db.execute({
      sql: 'UPDATE jobs SET gaps_data = ? WHERE id = ? AND user_id = ?',
      args: [JSON.stringify(parsed), parseInt(id), userId],
    });
    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Gaps error:', error);
    return NextResponse.json({ error: 'Gaps analysis failed' }, { status: 500 });
  }
}
