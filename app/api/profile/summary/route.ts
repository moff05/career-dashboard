import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '@/lib/db';
import { getUserId, getApiKey } from '@/lib/user';
import { logUsage } from '@/lib/usage';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const apiKey = getApiKey(request);
    if (!apiKey) return NextResponse.json({ error: 'API key required' }, { status: 401 });
    const anthropic = new Anthropic({ apiKey });
    const db = getDb();

    const resumeRow = (await db.execute({
      sql: 'SELECT raw_text FROM resume WHERE user_id = ? AND is_default = 1',
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

    // Each category's score must be one of a small set of explicitly anchored
    // values, enforced via the enum below (not just requested in the prompt) —
    // letting the model interpolate a continuous number (e.g. 1.5 between the
    // "1" and "2" anchors) on a borderline resume is what made repeat scoring
    // wobble by more than a point even at temperature 0.
    const CATEGORY = {
      relevant_experience:  { max: 3.5, values: [0, 1, 2, 3, 3.5] },
      quantified_impact:    { max: 2,   values: [0, 1, 2] },
      technical_depth:      { max: 2,   values: [0, 1, 2] },
      academic_credibility: { max: 1.5, values: [0, 0.5, 1, 1.5] },
      differentiation:      { max: 1,   values: [0, 0.5, 1] },
    } as const;

    const categorySchema = (values: readonly number[]) => ({
      type: 'object',
      properties: {
        score: { type: 'number', enum: values },
        rationale: { type: 'string' },
      },
      required: ['score', 'rationale'],
      additionalProperties: false,
    });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1600,
      temperature: 0,
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              strengths: { type: 'array', items: { type: 'string' } },
              gaps: { type: 'array', items: { type: 'string' } },
              score_breakdown: {
                type: 'object',
                properties: Object.fromEntries(
                  Object.entries(CATEGORY).map(([key, c]) => [key, categorySchema(c.values)])
                ),
                required: Object.keys(CATEGORY),
                additionalProperties: false,
              },
              summary: { type: 'string' },
            },
            required: ['strengths', 'gaps', 'score_breakdown', 'summary'],
            additionalProperties: false,
          },
        },
      },
      messages: [{
        role: 'user',
        content: `Score this candidate's resume for internship/entry-level job readiness. Be honest and calibrated, not encouraging — most college resumes are average, and the score should reflect that. Most candidates should land in the 4-6.5 range; 8+ should be rare and require multiple strong, quantified, differentiated signals.

RESUME:
${resumeText}

ADDITIONAL CONTEXT:
${memoriesText}

Score these 5 categories against their exact anchors below. Each category's score must be EXACTLY one of the listed values — never a number in between.

1. RELEVANT EXPERIENCE — one of 0, 1, 2, 3, 3.5
0 = no internships/co-ops/relevant work or research at all
1 = one unrelated job, or one relevant experience under a month / vague duties
2 = one solid relevant internship at a recognizable-but-not-elite company, or 2+ shorter ones
3 = 2+ relevant internships, or one at a genuinely competitive/name-brand employer with real scope
3.5 = multiple competitive internships, or unusual ownership for an intern (shipped something real, owned a deliverable used by the business)

2. QUANTIFIED IMPACT — one of 0, 1, 2
0 = every bullet is duty-based ("responsible for," "assisted with"), no numbers
1 = some numbers present but vague/low-signal ("team of 5," budget size with no outcome)
2 = most bullets show a real, causal outcome (%, $, time, scale) — not inflated buzzwords

3. TECHNICAL/FUNCTIONAL DEPTH — one of 0, 1, 2
0 = skills section is a buzzword list with no evidence anywhere else
1 = one project or coursework example actually demonstrating a claimed skill
2 = multiple substantive projects/work clearly proving depth a practitioner would recognize as real

4. ACADEMIC CREDIBILITY — one of 0, 0.5, 1, 1.5
0 = GPA below ~3.0 with no mitigating context (or omitted when it should help)
0.5 = GPA roughly 3.0-3.3, or a solid GPA at a clearly less competitive school
1 = GPA roughly 3.3-3.6 at a typical school, or a higher GPA at a still-not-elite school
1.5 = GPA 3.7+ and/or a school+major combo genuinely competitive for the target field

5. DIFFERENTIATION — one of 0, 0.5, 1
0 = nothing distinctive — indistinguishable from 200 similar resumes
0.5 = one real differentiator (substantive leadership title, relevant certification, notable competition)
1 = multiple strong differentiators, or one exceptional one (founded something real, published, nationally competitive result)

For strengths, give exactly 4. For gaps, give exactly 3. Each rationale: one sentence citing the specific resume detail that justifies that exact score. Be specific — reference actual details from the resume, not generic praise. Do not use emojis.`,
      }],
    });
    await logUsage(userId, 'profile_summary', 'claude-sonnet-4-6', response.usage);

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ error: 'Parse failed' }, { status: 500 });

    const parsed = JSON.parse(jsonMatch[0]) as {
      strengths: string[]; gaps: string[]; summary: string;
      score_breakdown: Record<string, { score: number; rationale: string }>;
    };

    // Compute the total ourselves from the sub-scores rather than trusting the
    // model's arithmetic, and attach each category's fixed max server-side
    // rather than asking the model to echo a value that never changes.
    let readinessScore = 0;
    const scoreBreakdown: Record<string, { score: number; max: number; rationale: string }> = {};
    for (const [key, cat] of Object.entries(CATEGORY)) {
      const entry = parsed.score_breakdown?.[key];
      const score = Math.min(Math.max(Number(entry?.score) || 0, 0), cat.max);
      scoreBreakdown[key] = { score, max: cat.max, rationale: entry?.rationale || '' };
      readinessScore += score;
    }
    readinessScore = Math.round(readinessScore * 10) / 10;

    return NextResponse.json({ ...parsed, score_breakdown: scoreBreakdown, readiness_score: readinessScore });
  } catch (error) {
    console.error('POST /api/profile/summary error:', error);
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 });
  }
}
