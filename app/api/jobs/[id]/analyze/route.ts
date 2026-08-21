import { NextRequest, NextResponse } from 'next/server';
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';
import { getDb } from '@/lib/db';
import { buildSystemPrompt } from '@/lib/ai-context';
import { getUserId, isSystemUser } from '@/lib/user';
import { logUsage } from '@/lib/usage';
import { getModel, geminiUsage } from '@/lib/groq';
import { isRateLimited, RATE_LIMIT_RESPONSE } from '@/lib/rateLimit';

// Reasoning model — thinks step-by-step, follows rubrics more literally.
// Generative routes (cover letter, bullets, coach) stay on the general model
// in lib/groq.ts. qwen/qwen3-32b was removed from Groq's lineup (404
// model_not_found as of 2026-08-21) — replaced with qwen/qwen3.6-27b,
// verified compatible with the JSON-mode scoring pattern below. Its
// reasoning is noticeably more verbose (900+ reasoning tokens per call in
// testing vs. a fraction of that before) — costs more per analyze call than
// the old model did, worth watching once real usage volume shows up.
const ANALYZE_MODEL = 'qwen/qwen3.6-27b';

export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = getUserId(request);
    if (isSystemUser(userId)) return NextResponse.json({ error: 'Not available' }, { status: 403 });
    if (await isRateLimited(userId)) return NextResponse.json(RATE_LIMIT_RESPONSE, { status: 429 });
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
      explicit_requirements: { max: 25, label: 'Explicit Requirements Met' },
      skills_match:           { max: 20, label: 'Skills Match' },
      role_alignment:         { max: 20, label: 'Role Alignment' },
      industry_fit:           { max: 20, label: 'Industry Fit' },
      logistics_fit:          { max: 15, label: 'Logistics / Location Fit' },
    } as const;

    const prompt = `You are a brutal, unsentimental job fit screener. Your job is accuracy — not encouragement. False optimism wastes the candidate's time and makes the tool useless. When in doubt, score lower. It is better to undersell a real fit than to oversell a weak one.

SCORE CALIBRATION — internalize this before scoring:
- 0–25 total: Not a realistic candidate. Major unmet requirements or wrong industry/function entirely.
- 26–45 total: Long shot. Would likely not clear a screen without something unusual working in their favor.
- 46–60 total: Possible. Gaps exist but candidate is plausible. Needs a very strong application.
- 61–75 total: Competitive. Has most of what the role needs. Small gaps won't disqualify.
- 76–100 total: Strong fit. Reserve for direct, obvious matches with documented relevant experience. Rare.

Most tracked applications land in the 25–55 range. Do not give credit for potential, transferability, or what the candidate "could learn." Score only what is documented on the resume today.

JOB: Company: ${job.company} | Title: ${job.title} | Type: ${typeLabel[job.type] || job.type} | Location: ${job.location || 'not specified'}
${job.description ? `Description:\n${job.description}` : '(No description)'}

Score each category with any integer from 0 to its maximum. The anchors below are reference points — use judgment to land between them when the situation calls for it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. EXPLICIT REQUIREMENTS MET — integer 0 to 25

Read only what the posting explicitly states is required: degree level, GPA cutoff, enrollment status, class year, required years of experience, named required certifications or tools.

0  = fails one or more explicit stated requirements. Full stop. Do not rationalize around it.
~5 = meets most but misses or only ambiguously satisfies one minor stated one
~10 = meets all stated requirements, but barely — only by a generous or uncertain reading
~15 = clearly meets every stated requirement with nothing left ambiguous
~20 = clearly meets every stated requirement and demonstrably exceeds at least one minor one
25 = clearly meets every stated requirement and demonstrably exceeds multiple, or exceeds a major one

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. SKILLS MATCH — integer 0 to 20

Judge only demonstrated skills — tools and techniques used in real jobs or internships. Coursework and class projects are weak signal. A student who "used Python in a class" is not the same as someone who built a production system with it.

0  = no meaningful overlap with what this role does day-to-day
~4 = one or two relevant skills, coursework or side project only
~8 = relevant skills but almost entirely via coursework — no real applied track record
~12 = real applied experience for some core skills, multiple gaps in role-specific tools
~16 = solid real experience, one or two specific gaps remaining
20 = strong direct overlap across all core skills — done this exact work in a real context

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. ROLE ALIGNMENT — integer 0 to 20

Is this the right level AND right function for where this candidate actually is right now?

0  = wrong level (requires experience the candidate doesn't have) OR wrong function entirely
~4 = major mismatch in level or function — not just a stretch
~8 = plausible on paper, but a real and noticeable stretch
~12 = right general level and function, meaningful mismatch in one dimension
~16 = good fit, only a minor mismatch
20 = exactly the right level and function for this candidate's current stage

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. INDUSTRY FIT — integer 0 to 20

STRICT. "Transferable skills" are not industry experience. The fact that skills learned elsewhere are broadly useful does NOT qualify for anything above 0. Relevant exposure must be direct and documented.

0  = no documented experience in this industry or a recognized adjacent sub-sector
~4 = peripheral connection only — one class, brief mention, or purely theoretical
~8 = documented experience in a genuinely neighboring industry (shared customers, workflows, or regulatory context — not just "also uses spreadsheets")
~12 = documented experience in a recognized adjacent sub-sector with real structural overlap
~16 = at least one internship, job, or sustained real project in this exact industry
20 = multiple roles or sustained projects in this exact industry with depth

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5. LOGISTICS / LOCATION FIT — integer 0 to 15

CRITICAL: "target cities" in the candidate profile = cities they are OPEN TO working in. It does NOT mean they currently live there. Current location and availability come ONLY from resume, school enrollment, graduation date, and profile notes.

SCHEDULING RULE: If the candidate is enrolled at a university in a different city than the job, AND the role runs during an academic semester (fall or spring co-op/internship), this IS a direct scheduling conflict → 0.
GRADUATION RULE: If a multi-semester co-op would push graduation past the candidate's stated date → 0.

0   = concrete conflict: semester scheduling, graduation timeline, city not in target list, or visa conflict
~5  = real logistical constraint that the profile neither confirms nor rules out
~10 = mostly clear, minor logistical question remains
15  = no conflict — posting silent on logistics, OR location matches target cities with no scheduling conflict evident

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUMMARY: State plainly whether this is a realistic shot or a long shot and exactly why. Do not soften. Do not say what the candidate "could" do to fix gaps — that is handled separately.

CRITICAL: Return valid JSON only — no markdown, no code blocks, no text before or after.
{"categories":{"explicit_requirements":{"score":0,"rationale":"2-3 sentences"},"skills_match":{"score":0,"rationale":"2-3 sentences"},"role_alignment":{"score":0,"rationale":"2-3 sentences"},"industry_fit":{"score":0,"rationale":"2-3 sentences"},"logistics_fit":{"score":0,"rationale":"1-2 sentences"}},"summary":"2-3 sentences, direct and unsentimental"}`;

    const response = await client.chat.completions.create({
      model: ANALYZE_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      // qwen3.6-27b's reasoning must be kept out of `content` in JSON mode
      // (Groq requires 'parsed' or 'hidden' here, not the 'raw' default) —
      // and Groq's default max_completion_tokens (1024) isn't enough headroom
      // for this model's reasoning on a rubric this long; it was silently
      // truncating mid-reasoning before ever emitting the JSON, which Groq's
      // own json_object validation then rejected with an empty failed_generation.
      max_completion_tokens: 6000,
      // reasoning_format is a Groq-only extension the OpenAI SDK's types
      // don't know about — still a real, honored request field at runtime.
      reasoning_format: 'parsed',
      messages: [
        ...(systemInstruction ? [{ role: 'system' as const, content: systemInstruction }] : []),
        { role: 'user' as const, content: prompt },
      ],
    } as ChatCompletionCreateParamsNonStreaming & { reasoning_format: 'parsed' | 'hidden' | 'raw' });
    await logUsage(userId, 'fit_scorecard', ANALYZE_MODEL, geminiUsage(response.usage));

    // Reasoning models sometimes emit <think>...</think> before JSON — strip it
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
