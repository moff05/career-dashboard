import { NextRequest, NextResponse } from 'next/server';
import { getUserId, getApiKey } from '@/lib/user';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '@/lib/db';
import { buildSystemPrompt } from '@/lib/ai-context';
import { logUsage } from '@/lib/usage';



export async function GET(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const apiKey = getApiKey(request);
    if (!apiKey) return NextResponse.json({ error: 'API key required' }, { status: 401 });
    const anthropic = new Anthropic({ apiKey });
    const db = getDb();
    const systemPrompt = await buildSystemPrompt(userId);

    const jobs = (await db.execute({
      sql: `SELECT id, company, title, status, match_score, deadline, location, type, posting_date
            FROM jobs WHERE user_id = ? AND status NOT IN ('rejected', 'offer') ORDER BY created_at DESC`,
      args: [userId],
    })).rows;

    if (jobs.length === 0) {
      return NextResponse.json({ error: 'no_jobs' });
    }

    const today = new Date().toISOString().split('T')[0];
    const jobList = jobs.map(j =>
      `ID:${j.id} | ${j.company} — ${j.title} | status:${j.status} | score:${j.match_score ?? 'unscored'}/10 | deadline:${j.deadline ?? 'none'} | type:${j.type} | location:${j.location ?? 'unknown'}`
    ).join('\n');

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Today is ${today}. Here are my active jobs:\n\n${jobList}\n\nReturn a JSON application strategy. Raw JSON only, no markdown fences:\n{\n  "narrative": "2-3 sentence strategic overview of my current situation and best approach",\n  "priority_jobs": [\n    {\n      "rank": 1,\n      "job_id": <number>,\n      "company": "<string>",\n      "title": "<string>",\n      "action": "Apply now" | "Follow up" | "Prep for interview" | "Research more" | "Reach out",\n      "urgency": "high" | "medium" | "low",\n      "reasoning": "<one concrete sentence why this rank>"\n    }\n  ],\n  "quick_actions": ["<3-4 specific things to do this week not tied to a single job>"]\n}\n\nPriority factors in order: (1) deadline proximity, (2) fit score, (3) stage (interviewing > applied > saved). Internships must be remote or Miami/FL for school schedule — deprioritize on-site internships in other cities. Show top 5 jobs max.`,
      }],
    });
    await logUsage(userId, 'strategy_advisor', 'claude-haiku-4-5-20251001', response.usage);

    const text = (response.content[0] as { type: string; text: string }).text.trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: 'parse_error' });

    return NextResponse.json(JSON.parse(match[0]));
  } catch (error) {
    console.error('Strategy API error:', error);
    return NextResponse.json({ error: 'Failed to generate strategy' }, { status: 500 });
  }
}
