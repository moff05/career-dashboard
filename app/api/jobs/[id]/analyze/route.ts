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
      company: string; title: string; type: string; location: string | null;
      description: string | null; salary_range: string | null; status: string;
    } | undefined;
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const anthropic = new Anthropic({ apiKey });
    const systemPrompt = await buildSystemPrompt(userId);
    const typeLabel: Record<string, string> = {
      'fall-2026-internship': 'Fall 2026 Internship', 'spring-2027-internship': 'Spring 2027 Internship',
      'summer-internship': 'Summer Internship', 'full-time': 'Full-Time / New Grad',
    };
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 900, system: systemPrompt,
      messages: [{ role: 'user', content: `Score this job across 5 categories (0-100). Return ONLY valid JSON.

JOB: Company: ${job.company} | Title: ${job.title} | Type: ${typeLabel[job.type] || job.type} | Location: ${job.location || 'not specified'}
${job.description ? `Description:\n${job.description}` : '(No description)'}

{"categories":[{"name":"Industry Fit","score":0,"rationale":""},{"name":"Skills Match","score":0,"rationale":""},{"name":"Role Alignment","score":0,"rationale":""},{"name":"Location Match","score":0,"rationale":""},{"name":"Growth Potential","score":0,"rationale":""}],"total":0,"summary":""}` }],
    });
    await logUsage(userId, 'fit_scorecard', 'claude-haiku-4-5-20251001', response.usage);
    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: 'Parse failed' }, { status: 500 });
    return NextResponse.json(JSON.parse(match[0]));
  } catch (error) {
    console.error('POST /api/jobs/[id]/analyze error:', error);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}
