import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '@/lib/db';
import { buildSystemPrompt } from '@/lib/ai-context';
import { getUserId, getApiKey, isSystemUser } from '@/lib/user';;
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

    // Discrete, anchored bands per category — same fix as the Candidate
    // Strength rubric: an open 0-100 continuum is what let this wobble and
    // drift generous. "Growth Potential" is dropped entirely; "could grow
    // into it" is exactly the kind of speculative credit that produces false
    // hope, so it's replaced with a literal stated-requirements check, which
    // is by far the most realistic predictor of clearing an actual screen.
    const CATEGORY = {
      explicit_requirements: { max: 25, values: [0, 10, 18, 25], label: 'Explicit Requirements Met' },
      skills_match:           { max: 20, values: [0, 8, 14, 20], label: 'Skills Match' },
      role_alignment:         { max: 20, values: [0, 8, 14, 20], label: 'Role Alignment' },
      industry_fit:           { max: 20, values: [0, 8, 14, 20], label: 'Industry Fit' },
      logistics_fit:          { max: 15, values: [0, 7, 15], label: 'Logistics / Location Fit' },
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
      system: systemPrompt,
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              categories: {
                type: 'object',
                properties: Object.fromEntries(
                  Object.entries(CATEGORY).map(([key, c]) => [key, categorySchema(c.values)])
                ),
                required: Object.keys(CATEGORY),
                additionalProperties: false,
              },
              summary: { type: 'string' },
            },
            required: ['categories', 'summary'],
            additionalProperties: false,
          },
        },
      },
      messages: [{ role: 'user', content: `Score how realistically this candidate would get through screening and land THIS SPECIFIC job — not how strong they are in general, and not how well they might grow into it. Be harsh and literal. Most applications, for most candidates, are not a great match: a realistic score distribution lands mostly in the 25-55 range out of 100. Scores above 75 should be rare and reserved for a genuinely strong, low-risk match with no material gaps against what this posting actually asks for. Do not give credit for "potential" — score against what is on the resume today. A candidate who is otherwise excellent but misses this posting's explicit stated requirements should score low on Explicit Requirements Met regardless of their overall strength; being a great candidate in general does not make someone a fit for a posting they don't meet the stated bar for.

JOB: Company: ${job.company} | Title: ${job.title} | Type: ${typeLabel[job.type] || job.type} | Location: ${job.location || 'not specified'}
${job.description ? `Description:\n${job.description}` : '(No description)'}

Score these 5 categories. Each score must be EXACTLY one of the listed values — never a number in between.

1. EXPLICIT REQUIREMENTS MET — one of 0, 10, 18, 25
0 = misses one or more explicit must-haves stated in the posting (required class year/degree, required years of experience, a named required skill/tool/certification)
10 = meets all explicit must-haves, but only barely or ambiguously based on what's in the resume
18 = clearly meets all explicit must-haves, nothing more
25 = clearly meets all explicit must-haves and exceeds at least one

2. SKILLS MATCH — one of 0, 8, 14, 20
0 = the candidate's actual demonstrated skills barely overlap with what this role would require day-to-day
8 = some overlap, but mostly via coursework/projects rather than real applied use
14 = solid overlap via real relevant experience, with a couple of clear gaps remaining
20 = strong, direct overlap — the candidate has demonstrably done this kind of work before

3. ROLE ALIGNMENT — one of 0, 8, 14, 20
0 = wrong level entirely for where this candidate actually is (e.g. posting wants 2+ years when candidate has none, or a new-grad role when still years from graduating)
8 = plausible but a real stretch — level or function is a noticeable mismatch
14 = good fit for level and function, with a minor mismatch
20 = exactly the right level and function for this candidate's actual stage

4. INDUSTRY FIT — one of 0, 8, 14, 20
0 = no exposure to this industry — background is in a clearly unrelated sector. Transferable skills do NOT count: if the only link is that some skills happen to be useful everywhere, score 0.
8 = the candidate has worked in a genuinely neighboring sector that shares customers, workflows, or regulatory context with this one (e.g., real estate → construction; fintech → banking; logistics → supply chain). A different but structurally related industry — not just "skills transfer."
14 = at least one internship, job, or sustained real project in this exact industry or a recognized sub-sector of it
20 = repeated, direct experience in this exact industry across multiple roles or projects

5. LOGISTICS / LOCATION FIT — one of 0, 7, 15
0 = the posting states a location/remote/visa requirement that conflicts with something stated in the candidate's profile, with no stated flexibility
7 = the posting states a real constraint (relocation, on-site, visa sponsorship not offered) that the candidate's profile neither confirms nor rules out
15 = the posting states no location/remote constraint at all, or whatever it states is already satisfied by the candidate's profile — default here when the posting is silent on logistics, since silence is not a stated conflict

The summary must be direct and unsentimental: state plainly whether this is a realistic shot or a long shot, and why, in 2-3 sentences. Do not soften it to make the candidate feel better — that defeats the point of tracking applications honestly.` }],
    });
    await logUsage(userId, 'fit_scorecard', 'claude-sonnet-4-6', response.usage);
    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: 'Parse failed' }, { status: 500 });

    const parsed = JSON.parse(match[0]) as { categories: Record<string, { score: number; rationale: string }>; summary: string };

    // Sum the model's own sub-scores server-side rather than asking it to
    // also report a total — one less thing it can get arithmetically wrong,
    // and the displayed total always matches the breakdown shown under it.
    let total = 0;
    const categories = Object.entries(CATEGORY).map(([key, c]) => {
      const entry = parsed.categories?.[key];
      const score = Math.min(Math.max(Number(entry?.score) || 0, 0), c.max);
      total += score;
      return { name: c.label, score, max: c.max, rationale: entry?.rationale || '' };
    });

    await db.execute({
      sql: 'UPDATE jobs SET match_score = ?, score_data = ? WHERE id = ? AND user_id = ?',
      args: [total, JSON.stringify({ categories, total, summary: parsed.summary }), parseInt(id), userId],
    });

    return NextResponse.json({ categories, total, summary: parsed.summary });
  } catch (error) {
    console.error('POST /api/jobs/[id]/analyze error:', error);
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
  }
}
