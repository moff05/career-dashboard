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
      contents: [{ role: 'user', parts: [{ text: `Resume tailoring advice for this job. Return ONLY valid JSON.
JOB: Company: ${job.company} | Title: ${job.title}
${job.description ? `JD:\n${String(job.description).slice(0, 6000)}` : '(No JD)'}
{"lead_with":[{"experience":"","why":""}],"tailored_bullets":[{"original":"","tailored":"","why":""}],"keywords_to_add":[],"deprioritize":[]}` }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    });
    await logUsage(userId, 'resume_bullets', GEMINI_MODEL, geminiUsage(result.response.usageMetadata));
    const text = result.response.text();
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
