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
    const model = getModel(systemPrompt);
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: `Analyze fit gaps for this job. Return ONLY valid JSON.

JOB: Company: ${job.company} | Title: ${job.title}
${job.description ? `JD:\n${String(job.description).slice(0, 6000)}` : '(No JD)'}

Rules for should_apply:
- Set to FALSE when there is a hard structural disqualifier: a graduation date or enrollment conflict the posting makes explicit, a missing required credential or class year, a location/visa requirement that cannot be met. Strong skills do NOT override a hard gate — if the candidate can't clear the initial screen, applying wastes their time.
- Set to TRUE only when the candidate legitimately clears all stated requirements, or when there is exactly one ambiguous blocker that a single verifiable action (e.g. one email to HR) could resolve before the deadline. If the blocker is structural and the posting is explicit about it, it is not ambiguous.
- apply_reasoning must be direct and honest about why you chose true or false. If false, say plainly what the disqualifier is and why it cannot be worked around.

{"gaps":[{"skill":"","severity":"major","how_to_address":""}],"positioning":"","quick_wins":[],"should_apply":true,"apply_reasoning":""}` }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    });
    await logUsage(userId, 'fit_gaps', GEMINI_MODEL, geminiUsage(result.response.usageMetadata));
    const text = result.response.text();
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
