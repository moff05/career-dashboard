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

    // Industry Fit dropped 20 -> 10 (2026-09-02): a strict "no credit for
    // transferable skills" category at 20% weight was structurally close to
    // unwinnable for a graduating senior applying across industries, and it
    // was doing so on both of Nicholas's real tracked jobs (0/20 on Anduril,
    // 4/20 on Deloitte) despite decent Skills Match/Role Alignment on both.
    // The 10 points moved off it went to Skills Match and Role Alignment,
    // which are more predictive and more within a candidate's control at
    // this career stage than "have you already worked in this exact
    // industry" is.
    //
    // Logistics/Location Fit dropped 15 -> 10, same day: Nicholas is
    // genuinely location-flexible ("I have a preference on location but the
    // job matters so much more") and the rubric was treating "city not in
    // target list" as equivalent to a real scheduling conflict - both landed
    // at a hard 0, which the gaps route then read as a should-not-apply
    // signal (see gaps/route.ts). See the rewritten category 5 below: 0 is
    // now reserved for an actual conflict (semester scheduling, graduation
    // timeline, visa), not a location preference mismatch. The 5 points
    // freed up went to Explicit Requirements Met - the most literal,
    // verifiable, in-the-candidate's-control category.
    const CATEGORY = {
      explicit_requirements: { max: 30, label: 'Explicit Requirements Met' },
      skills_match:           { max: 25, label: 'Skills Match' },
      role_alignment:         { max: 25, label: 'Role Alignment' },
      industry_fit:           { max: 10, label: 'Industry Fit' },
      logistics_fit:          { max: 10, label: 'Logistics / Location Fit' },
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
1. EXPLICIT REQUIREMENTS MET — integer 0 to 30

Read only what the posting explicitly states is required: degree level, GPA cutoff, enrollment status, class year, required years of experience, named required certifications or tools.

If a requirement lists alternative qualifying paths ("X, Y, or Z"), credit the candidate for satisfying ANY ONE path — do not penalize for lacking a different listed alternative.

0  = fails one or more explicit stated requirements. Full stop. Do not rationalize around it.
~6 = meets most but misses or only ambiguously satisfies one minor stated one
~12 = meets all stated requirements, but barely — only by a generous or uncertain reading
~18 = clearly meets every stated requirement with nothing left ambiguous
~24 = clearly meets every stated requirement and demonstrably exceeds at least one minor one
30 = clearly meets every stated requirement and demonstrably exceeds multiple, or exceeds a major one

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. SKILLS MATCH — integer 0 to 25

Judge only demonstrated skills — tools and techniques used in real jobs or internships. Coursework and class projects are weak signal. A student who "used Python in a class" is not the same as someone who built a production system with it.

When a candidate has applied a general-purpose skill (AI/automation tooling, programming, data analysis) TO a specific domain across multiple real roles — e.g., automating real-estate rent-roll analysis, building a healthcare scheduling tool — that IS demonstrated domain skill, not a generic tech background that happens to touch the domain. Don't discount domain-specific work just because the resume also names the tool or mechanism used to do it.

0  = no meaningful overlap with what this role does day-to-day
~5 = one or two relevant skills, coursework or side project only
~10 = relevant skills but almost entirely via coursework — no real applied track record
~15 = real applied experience for some core skills, multiple gaps in role-specific tools
~20 = solid real experience, one or two specific gaps remaining
25 = strong direct overlap across all core skills — done this exact work in a real context

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. ROLE ALIGNMENT — integer 0 to 25

Is this the right level AND right function for where this candidate actually is right now?

A candidate's actual, repeated work history in one domain is stronger signal than a broad or generic target-roles list in their profile. If they have real experience across multiple roles/projects in the same industry or function, a new role in that same domain is NOT a "stretch" just because they also have a technical or automation skill layered on top of that domain work — that skill is additive, not evidence of a competing trajectory pulling them elsewhere. Weight a candidate's own stated career goal (profile notes, if present) as real signal too — don't let a broad or scattershot target-roles list override a clearly and specifically stated goal.

0  = wrong level (requires experience the candidate doesn't have) OR wrong function entirely
~5 = major mismatch in level or function — not just a stretch
~10 = plausible on paper, but a real and noticeable stretch
~15 = right general level and function, meaningful mismatch in one dimension
~20 = good fit, only a minor mismatch
25 = exactly the right level and function for this candidate's current stage

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. INDUSTRY FIT — integer 0 to 10

STRICT. "Transferable skills" are not industry experience. The fact that skills learned elsewhere are broadly useful does NOT qualify for anything above 0. Relevant exposure must be direct and documented.

0  = no documented experience in this industry or a recognized adjacent sub-sector
~2 = peripheral connection only — one class, brief mention, or purely theoretical
~4 = documented experience in a genuinely neighboring industry (shared customers, workflows, or regulatory context — not just "also uses spreadsheets")
~6 = documented experience in a recognized adjacent sub-sector with real structural overlap
~8 = at least one internship, job, or sustained real project in this exact industry
10 = multiple roles or sustained projects in this exact industry with depth

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5. LOGISTICS / LOCATION FIT — integer 0 to 10

CRITICAL: "target cities" in the candidate profile = cities they are OPEN TO working in, weighted by preference — not a hard requirement, and not where they currently live. Current location and availability come ONLY from resume, school enrollment, graduation date, and profile notes. Candidates are generally more location-flexible than their stated preferences alone suggest, especially for full-time/post-grad roles — a city outside the target list is a real signal, not a wall.

Reserve 0 for an ACTUAL conflict, never for a bare preference mismatch:
SCHEDULING RULE: candidate enrolled at a university in a different city than the job, AND the role runs during an academic semester (fall or spring co-op/internship) → 0.
GRADUATION RULE: a multi-semester co-op would push graduation past the candidate's stated date → 0.
VISA RULE: the posting states a work-authorization/visa requirement the candidate's profile contradicts or doesn't clearly meet → 0.
The job's city simply not being on the candidate's target list, with none of the three conflicts above present, is NOT a 0 — score it in the ~3 band.

0  = one of the three conflicts above — an actual scheduling/graduation/visa impossibility, not a preference mismatch
~3 = city outside the candidate's target list, no scheduling/graduation/visa conflict — a real preference mismatch, not disqualifying
~7 = mostly clear, minor logistical question remains (e.g. unclear semester timing)
10 = no conflict — posting silent on logistics, location matches target cities, or a full-time role with no scheduling constraint evident

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
      // 4000 (not higher): this account's Groq tier caps at 8000 tokens/min
      // for this model, and the limit is prompt_tokens + max_completion_tokens
      // combined — a real request here ran ~2800 prompt tokens, so 6000 blew
      // through the 8000 ceiling with a 413 even though far fewer completion
      // tokens were actually used (~3300 observed in testing).
      max_completion_tokens: 4000,
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

    const parsed = JSON.parse(match[0]) as { categories: Record<string, { score: number; rationale: string }>; summary?: string };

    // A truncated response (hit finish_reason: 'length' - this model can burn
    // most of its completion budget on hidden reasoning tokens before ever
    // writing the JSON) still parses as valid JSON since Groq's constrained
    // decoder force-closes braces on cutoff - it's just missing keys.
    // Silently defaulting a missing category to a score of 0 would write a
    // wrong, artificially low total straight to the DB with no error shown.
    // Caught exactly this happening in testing: 2 of 5 categories present,
    // finish_reason 'length', 3812 of 4000 completion tokens spent on
    // reasoning alone. Fail loud instead.
    const missingKeys = Object.keys(CATEGORY).filter((key) => !parsed.categories?.[key]?.rationale);
    if (missingKeys.length > 0 || !parsed.summary) {
      console.error('POST /api/jobs/[id]/analyze truncated response, missing:', missingKeys, response.choices[0]?.finish_reason);
      return NextResponse.json({ error: 'Analysis was cut off before finishing — try again' }, { status: 500 });
    }

    let total = 0;
    const categories = Object.entries(CATEGORY).map(([key, c]) => {
      const entry = parsed.categories[key];
      const score = Math.min(Math.max(Number(entry.score) || 0, 0), c.max);
      total += score;
      return { name: c.label, score, max: c.max, rationale: entry.rationale };
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
