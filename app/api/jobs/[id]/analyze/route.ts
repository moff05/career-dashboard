import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { buildSystemPrompt } from '@/lib/ai-context';
import { getUserId, isSystemUser } from '@/lib/user';
import { logUsage } from '@/lib/usage';
import { getModel, geminiUsage } from '@/lib/gemini';

// Reasoning model — thinks step-by-step before answering, follows rubrics
// more literally than standard chat models. Only used for scoring where
// accuracy matters; generative routes stay on the faster llama-3.3-70b.
const ANALYZE_MODEL = 'qwen/qwen3-32b';

export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = getUserId(request);
    if (isSystemUser(userId)) return NextResponse.json({ error: 'Not available' }, { status: 403 });
    const { id } = await params;
    const db = getDb();
    const job = (await db.execute({ sql: 'SELECT * FROM jobs WHERE id = ? AND user_id = ?', args: [parseInt(id), userId] })).rows[0] as unknown as {
      company: string; title: string; type: string; location: string | null;
      description: string | null; salary_range: string | null; status: string;
    } | undefined;
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const systemPrompt = await buildSystemPrompt(userId);
    const { client, systemInstruction } = getModel(systemPrompt);
    const typeLabel: Record<string, string> = {
      'fall-2026-internship': 'Fall 2026 Internship', 'spring-2027-internship': 'Spring 2027 Internship',
      'summer-internship': 'Summer Internship', 'full-time': 'Full-Time / New Grad',
    };

    const CATEGORY = {
      explicit_requirements: { max: 25, values: [0, 10, 18, 25], label: 'Explicit Requirements Met' },
      skills_match:           { max: 20, values: [0, 8, 14, 20], label: 'Skills Match' },
      role_alignment:         { max: 20, values: [0, 8, 14, 20], label: 'Role Alignment' },
      industry_fit:           { max: 20, values: [0, 8, 14, 20], label: 'Industry Fit' },
      logistics_fit:          { max: 15, values: [0, 7, 15], label: 'Logistics / Location Fit' },
    } as const;

    const prompt = `You are a brutal, unsentimental job fit screener. Your job is accuracy — not encouragement. False optimism wastes the candidate's time and makes the tool useless. When in doubt, score lower. It is better to undersell a real fit than to oversell a weak one.

SCORE CALIBRATION — READ THIS FIRST:
- 0-25: Not a realistic candidate. Major unmet requirements or wrong industry/function entirely.
- 26-45: Long shot. Candidate might get through if the pipeline is thin, but most screeners would pass.
- 46-60: Possible. Gaps exist but candidate is plausible. Needs a strong application to compete.
- 61-75: Competitive. Candidate has most of what the role needs. Small gaps won't disqualify.
- 76-100: Strong fit. Reserve for direct, obvious matches with documented relevant experience. This should be rare.

Most applications tracked in a job search tool land in the 25-55 range. If you are scoring above 60, ask yourself: does this candidate have DIRECT relevant experience, or are you giving credit for potential and transferability? Potential and transferability do NOT count. Score what is on the resume today.

JOB: Company: ${job.company} | Title: ${job.title} | Type: ${typeLabel[job.type] || job.type} | Location: ${job.location || 'not specified'}
${job.description ? `Description:\n${job.description}` : '(No description)'}

Score these 5 categories. Each score must be EXACTLY one of the listed values — no other numbers, no interpolating.

1. EXPLICIT REQUIREMENTS MET — one of 0, 10, 18, 25
Check ONLY what the posting explicitly states as required (degree level, GPA, class year, required tools by name, required certifications, required years of experience).
0 = fails one or more explicit stated requirements — full stop. Do not rationalize.
10 = meets all stated requirements, but just barely or only by generous reading of the resume
18 = clearly meets all stated requirements, nothing more
25 = clearly meets all stated requirements AND demonstrably exceeds at least one with documented evidence

2. SKILLS MATCH — one of 0, 8, 14, 20
Judge ONLY demonstrated skills — tools used in real jobs or internships. Coursework and class projects are near-worthless signal; weight them accordingly.
0 = skills on resume barely overlap with what this role does day-to-day
8 = some overlap but it is mostly coursework or one-off projects, not sustained applied experience
14 = real relevant experience exists, but clear gaps in specific tools or domains the role needs
20 = strong direct overlap — candidate has demonstrably done this exact kind of work in a real context

3. ROLE ALIGNMENT — one of 0, 8, 14, 20
Is this the right level AND function for where this candidate actually is right now?
0 = wrong level (posting wants experience the candidate doesn't have) OR wrong function entirely
8 = plausible but a stretch — real mismatch in level, function, or scope
14 = right level, right general function, minor mismatch
20 = exactly the right level and function for this candidate's current stage

4. INDUSTRY FIT — one of 0, 8, 14, 20
STRICT. "Transferable skills" do NOT qualify for any score above 0. Relevant industry exposure must be direct and documented.
0 = no documented experience in this industry or a recognized adjacent sub-sector. General business/tech skills do not count.
8 = documented experience in a genuinely neighboring industry that shares specific workflows, customers, or regulatory context — NOT just that skills are broadly useful
14 = at least one internship, job, or sustained real project in this exact industry or a clear recognized sub-sector
20 = multiple roles or sustained projects in this exact industry

5. LOGISTICS / LOCATION FIT — one of 0, 7, 15
CRITICAL DISTINCTION: "target cities" = cities the candidate is OPEN TO working in. It does NOT mean they currently live there. Current location and availability constraints come ONLY from the resume, school enrollment, graduation date, and profile notes.
SCHEDULING RULE: If the candidate is enrolled as a student at a university in a different city than the job, AND the role runs during an academic semester (fall or spring co-op/internship), this IS a direct scheduling conflict → score 0. The fact that a city is in their target list does not override a semester scheduling conflict.
0 = concrete conflict: job requires on-site presence in a city the candidate can't be in during that period (school in different city during that semester); OR city is not in target list; OR visa/sponsorship conflict with no flexibility
7 = real logistical constraint exists (specific city, on-site, relocation, timing) and the profile genuinely doesn't confirm or rule it out
15 = posting is silent on logistics, OR location matches target cities AND there is no scheduling or timing conflict evident in the profile

SUMMARY RULES: State plainly whether this is a realistic shot or a long shot and exactly why. Do not soften. Do not mention what the candidate "could" do to improve — that is what the Gaps section is for.

CRITICAL: Return valid JSON only — no markdown, no code blocks, no text before or after.
{"categories":{"explicit_requirements":{"score":0,"rationale":"2-3 sentences"},"skills_match":{"score":0,"rationale":"2-3 sentences"},"role_alignment":{"score":0,"rationale":"2-3 sentences"},"industry_fit":{"score":0,"rationale":"2-3 sentences"},"logistics_fit":{"score":0,"rationale":"1-2 sentences"}},"summary":"2-3 sentences, direct and unsentimental"}`;

    const response = await client.chat.completions.create({
      model: ANALYZE_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        ...(systemInstruction ? [{ role: 'system' as const, content: systemInstruction }] : []),
        { role: 'user' as const, content: prompt },
      ],
    });
    await logUsage(userId, 'fit_scorecard', ANALYZE_MODEL, geminiUsage(response.usage));

    // Reasoning models sometimes emit <think>...</think> before the JSON — strip it
    const raw = response.choices[0]?.message?.content || '{}';
    const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: 'Parse failed' }, { status: 500 });

    const parsed = JSON.parse(match[0]) as { categories: Record<string, { score: number; rationale: string }>; summary: string };

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
