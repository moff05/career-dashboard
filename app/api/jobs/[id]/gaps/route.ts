import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { buildSystemPrompt } from '@/lib/ai-context';
import { getUserId, isSystemUser } from '@/lib/user';
import { logUsage } from '@/lib/usage';
import { getModel, geminiUsage, GEMINI_MODEL } from '@/lib/groq';
import { isRateLimited, RATE_LIMIT_RESPONSE } from '@/lib/rateLimit';

export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = getUserId(request);
    if (isSystemUser(userId)) return NextResponse.json({ error: 'Not available' }, { status: 403 });
    if (await isRateLimited(userId)) return NextResponse.json(RATE_LIMIT_RESPONSE, { status: 429 });
    const { id } = await params;
    const db = getDb();
    const job = (await db.execute({ sql: 'SELECT * FROM jobs WHERE id = ? AND user_id = ?', args: [parseInt(id), userId] })).rows[0] as unknown as {
      company: string; title: string; description: string | null; score_data: string | null;
    } | undefined;
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    // Read the scorecard so we can enforce hard disqualifiers server-side
    let logisticsScore: number | null = null;
    let logisticsRationale = '';
    let totalScore: number | null = null;
    if (job.score_data) {
      try {
        const sd = JSON.parse(job.score_data) as { categories?: { name: string; score: number; rationale?: string }[]; total?: number };
        totalScore = sd.total ?? null;
        const logCat = sd.categories?.find(c => c.name === 'Logistics / Location Fit');
        if (logCat) {
          logisticsScore = logCat.score;
          logisticsRationale = logCat.rationale || '';
        }
      } catch { /* ignore */ }
    }
    // A 0 on this category should mean a real scheduling/graduation/visa
    // conflict (see the rubric in analyze/route.ts), not just "city isn't on
    // the candidate's target list" — Nicholas is genuinely location-flexible
    // ("I have a preference on location but the job matters so much more")
    // and a preference mismatch alone shouldn't be able to force a
    // should-not-apply verdict. Belt-and-suspenders against the model still
    // mis-scoring a preference mismatch as 0: only treat it as a hard
    // conflict if the category's own rationale actually describes one.
    const isRealLogisticsConflict = logisticsScore === 0 && /semester|enrolled|graduat|visa|clearance|authorization/i.test(logisticsRationale);

    const systemPrompt = await buildSystemPrompt(userId);
    const { client, systemInstruction } = getModel(systemPrompt);

    const prompt = `You are a blunt career advisor. Analyze the fit gaps between this candidate and this specific job posting. Be honest — if there are hard disqualifiers, name them plainly.

JOB: Company: ${job.company} | Title: ${job.title}
${job.description ? `JD:\n${String(job.description).slice(0, 6000)}` : '(No JD — base analysis on role title and company)'}

Gap severity definitions:
- "major": The posting explicitly lists this as required and the candidate clearly lacks it. A recruiter will notice immediately. This includes location/scheduling conflicts, missing credentials, wrong graduation year, required years of experience the candidate doesn't have.
- "minor": Would strengthen the application but isn't a stated hard requirement.

"how_to_address": Be specific. Name the exact course, certification, or action and realistic timeline. "Take an online course" is too vague.

Rules for should_apply:
- false when ANY hard structural disqualifier exists: a genuine scheduling conflict (can't physically be in that city during that semester due to school enrollment), a graduation-timeline conflict, missing required credential, a stated visa/work-authorization issue the candidate doesn't meet, required years of experience the candidate lacks. Strong skills do NOT override a hard gate — if the candidate can't physically be there or doesn't meet a stated requirement, it's false.
- The job's city simply not matching the candidate's stated location preference is NOT, by itself, a hard disqualifier — candidates are generally more location-flexible than a preference list suggests. Only treat location as disqualifying when there's an actual scheduling/enrollment conflict, not a bare preference mismatch.
- true only when the candidate legitimately clears all stated requirements with no hard blockers.
- apply_reasoning: Name the deciding factor plainly. If false, state exactly what the disqualifier is.

"positioning": 2-3 sentences on the strongest angle to lead with IF applying. Skip encouragement — be tactical.
"quick_wins": Up to 3 specific actions doable in 48 hours that would strengthen this application.

Return ONLY valid JSON, no other text:
{"gaps":[{"skill":"specific gap name","severity":"major or minor","how_to_address":"specific actionable step"}],"positioning":"2-3 sentences","quick_wins":["action 1","action 2"],"should_apply":true,"apply_reasoning":"direct explanation"}`;

    const response = await client.chat.completions.create({
      model: GEMINI_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        ...(systemInstruction ? [{ role: 'system' as const, content: systemInstruction }] : []),
        { role: 'user' as const, content: prompt },
      ],
    });
    await logUsage(userId, 'fit_gaps', GEMINI_MODEL, geminiUsage(response.usage));
    const text = response.choices[0]?.message?.content || '{}';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: 'Parse failed' }, { status: 500 });
    const parsed = JSON.parse(match[0]) as {
      gaps: { skill: string; severity: string; how_to_address: string }[];
      positioning: string; quick_wins: string[];
      should_apply: boolean; apply_reasoning: string;
    };

    // Hard server-side overrides — model can't talk its way out of a real
    // conflict on logistics, or a very low total score
    if (isRealLogisticsConflict) {
      parsed.should_apply = false;
      if (!parsed.apply_reasoning?.toLowerCase().includes('schedul') &&
          !parsed.apply_reasoning?.toLowerCase().includes('conflict') &&
          !parsed.apply_reasoning?.toLowerCase().includes('visa') &&
          !parsed.apply_reasoning?.toLowerCase().includes('graduat')) {
        parsed.apply_reasoning = `Scheduling/graduation/visa conflict: the scorecard flagged a hard logistics disqualifier (0/10). ${parsed.apply_reasoning || ''}`.trim();
      }
    }
    if (totalScore !== null && totalScore < 30) {
      parsed.should_apply = false;
    }

    await db.execute({
      sql: 'UPDATE jobs SET gaps_data = ? WHERE id = ? AND user_id = ?',
      args: [JSON.stringify(parsed), parseInt(id), userId],
    });
    return NextResponse.json(parsed);
  } catch (error) {
    console.error('Gaps error:', error);
    return NextResponse.json({ error: 'Gaps analysis failed' }, { status: 500 });
  }
}
