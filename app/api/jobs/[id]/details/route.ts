import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '@/lib/db';
import { buildSystemPrompt } from '@/lib/ai-context';
import { getUserId, getApiKey } from '@/lib/user';
import { logUsage } from '@/lib/usage';

export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = getUserId(request);
    const apiKey = getApiKey(request);
    if (!apiKey) return NextResponse.json({ error: 'API key required' }, { status: 401 });
    const { id } = await params;
    const db = getDb();
    const job = (await db.execute({ sql: 'SELECT * FROM jobs WHERE id = ? AND user_id = ?', args: [parseInt(id), userId] })).rows[0] as unknown as {
      company: string; title: string; type: string; location: string | null; description: string | null;
    } | undefined;
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const anthropic = new Anthropic({ apiKey });
    const systemPrompt = await buildSystemPrompt(userId);
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 1200, system: systemPrompt,
      messages: [{ role: 'user', content: `Break down this job. Return ONLY valid JSON.
JOB: Company: ${job.company} | Title: ${job.title} | Location: ${job.location || 'not specified'}
${job.description ? `Description:\n${String(job.description).slice(0, 6000)}` : '(No description)'}
{"company_overview":"","role_summary":"","key_qualifications":[],"what_to_highlight":""}` }],
    });
    await logUsage(userId, 'job_details', 'claude-haiku-4-5-20251001', response.usage);
    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: 'Parse failed' }, { status: 500 });
    return NextResponse.json(JSON.parse(match[0]));
  } catch (error) {
    console.error('POST /api/jobs/[id]/details error:', error);
    return NextResponse.json({ error: 'Details generation failed' }, { status: 500 });
  }
}
