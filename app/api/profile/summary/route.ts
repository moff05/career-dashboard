import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '@/lib/db';
import { getUserId, getApiKey } from '@/lib/user';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const apiKey = getApiKey(request);
    if (!apiKey) return NextResponse.json({ error: 'API key required' }, { status: 401 });
    const anthropic = new Anthropic({ apiKey });
    const db = getDb();

    const resumeRow = (await db.execute({
      sql: 'SELECT raw_text FROM resume WHERE user_id = ?',
      args: [userId],
    })).rows[0] as unknown as { raw_text: string } | undefined;
    const resumeText = resumeRow?.raw_text || 'No resume provided.';

    const memRows = (await db.execute({
      sql: 'SELECT content, category FROM memories WHERE user_id = ? ORDER BY created_at DESC LIMIT 20',
      args: [userId],
    })).rows as unknown as { content: string; category: string }[];
    const memoriesText = memRows.length > 0
      ? memRows.map(m => `[${m.category}] ${m.content}`).join('\n')
      : 'No additional memories.';

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Based on this candidate's resume and saved context, generate a strength summary for competitive job applications.

RESUME:
${resumeText}

ADDITIONAL CONTEXT:
${memoriesText}

Return ONLY valid JSON:
{
  "strengths": ["strength 1", "strength 2", "strength 3", "strength 4"],
  "gaps": ["gap 1", "gap 2", "gap 3"],
  "readiness_score": 7,
  "summary": "2-3 sentence overall summary"
}

Be specific and reference actual details from the resume. readiness_score is 1-10 for competitive tech/finance roles.`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return NextResponse.json(JSON.parse(jsonMatch[0]));

    return NextResponse.json({ error: 'Parse failed' }, { status: 500 });
  } catch (error) {
    console.error('POST /api/profile/summary error:', error);
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}
