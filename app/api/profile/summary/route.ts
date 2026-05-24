import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '@/lib/db';

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST() {
  try {
    const db = getDb();
    const resumeRow = (await db.execute('SELECT raw_text FROM resume WHERE id = 1')).rows[0] as unknown as { raw_text: string } | undefined;
    const resumeText = resumeRow?.raw_text || 'Nicholas Moffett, junior at University of Miami, GPA 3.71, CRE tech + AI automation background.';

    const memRows = (await db.execute('SELECT content, category FROM memories ORDER BY created_at DESC LIMIT 20')).rows as unknown as { content: string; category: string }[];
    const memoriesText = memRows.length > 0
      ? memRows.map(m => `[${m.category}] ${m.content}`).join('\n')
      : 'No additional memories.';

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Based on this candidate's resume and saved context, generate a candidate strength summary for competitive job applications.

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

Be specific and reference actual details from the resume. readiness_score is 1-10 for competitive tech/finance/real estate roles.`,
      }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return NextResponse.json(JSON.parse(jsonMatch[0]));

    return NextResponse.json({
      strengths: ['Strong CRE tech + AI automation background', 'Entrepreneurial experience (N&S Digital)', 'High GPA at competitive school', 'Real-world internship experience'],
      gaps: ['Limited software engineering portfolio', 'Could benefit from more formal CS courses'],
      readiness_score: 7,
      summary: 'Nicholas is a strong candidate with unique intersection of real estate technology and AI automation skills.',
    });
  } catch (error) {
    console.error('POST /api/profile/summary error:', error);
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}
