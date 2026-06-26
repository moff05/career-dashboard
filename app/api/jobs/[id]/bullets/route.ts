import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '@/lib/db';
import { buildSystemPrompt } from '@/lib/ai-context';
import { getUserId, getApiKey, isSystemUser } from '@/lib/user';
import { logUsage } from '@/lib/usage';

export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = getUserId(request);
    if (isSystemUser(userId)) return NextResponse.json({ error: 'Not available' }, { status: 403 });    const apiKey = getApiKey(request);
    if (!apiKey) return NextResponse.json({ error: 'API key required' }, { status: 401 });
    const { id } = await params;
    const db = getDb();
    const job = (await db.execute({ sql: 'SELECT * FROM jobs WHERE id = ? AND user_id = ?', args: [parseInt(id), userId] })).rows[0] as unknown as {
      company: string; title: string; description: string | null;
    } | undefined;
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const anthropic = new Anthropic({ apiKey });
    const systemPrompt = await buildSystemPrompt(userId);
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 1400, system: systemPrompt,
      messages: [{ role: 'user', content: `Resume tailoring advice for this job. Return ONLY valid JSON.
JOB: Company: ${job.company} | Title: ${job.title}
${job.description ? `JD:\n${String(job.description).slice(0, 6000)}` : '(No JD)'}
{"lead_with":[{"experience":"","why":""}],"tailored_bullets":[{"original":"","tailored":"","why":""}],"keywords_to_add":[],"deprioritize":[]}` }],
    });
    await logUsage(userId, 'resume_bullets', 'claude-haiku-4-5-20251001', response.usage);
    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: 'Parse failed' }, { status: 500 });
    const result = JSON.parse(match[0]);
    await db.execute({
      sql: 'UPDATE jobs SET bullets_data = ? WHERE id = ? AND user_id = ?',
      args: [JSON.stringify(result), parseInt(id), userId],
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Bullets error:', error);
    return NextResponse.json({ error: 'Bullets analysis failed' }, { status: 500 });
  }
}
