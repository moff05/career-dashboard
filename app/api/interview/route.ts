import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt } from '@/lib/ai-context';

export const maxDuration = 60;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TYPE_LABELS: Record<string, string> = {
  behavioral: 'behavioral (STAR-method questions about past experiences and how you handled situations)',
  product: 'product management and product sense (design a product, improve a metric, prioritization)',
  technical: 'technical problem-solving, analytical thinking, and data reasoning',
  case: 'business case and strategic analysis (market sizing, go-to-market, strategic decisions)',
  fit: 'culture fit, motivation, and career goals',
};

export async function POST(request: NextRequest) {
  try {
    const { company, title, interview_type, exchanges, action, current_answer, question_number } = await request.json();

    const candidateContext = await buildSystemPrompt();
    const totalQuestions = 5;
    const isLast = question_number >= totalQuestions;

    const system = `You are a professional interviewer at ${company} conducting a ${TYPE_LABELS[interview_type] || interview_type} interview for the ${title} role.

${candidateContext}

INTERVIEW RULES:
- Ask realistic, appropriately scoped questions for an entry-level/internship candidate
- Keep questions concise (2-3 sentences max)
- Feedback must be specific and honest — name actual strengths AND clear weaknesses
- Do not be sycophantic; give the candidate real signal they can act on
- Total of ${totalQuestions} questions for this session`;

    let userPrompt: string;

    if (action === 'start') {
      userPrompt = `Introduce yourself in one sentence as the interviewer, then ask question 1 of ${totalQuestions}. Make it a strong, realistic opening question for a ${TYPE_LABELS[interview_type] || interview_type} interview at ${company}.`;
    } else if (isLast) {
      userPrompt = `Nicholas answered question ${question_number} (the final question): "${current_answer}"

Give 2-3 sentences of specific feedback on this answer. Then provide a final assessment:
**Overall:** [Strong / Good / Needs Work]
**Best moment:** [what stood out most positively in the full interview]
**Key gap:** [the most important thing to improve before the real interview]
**Prep tip:** [one concrete, specific thing to do before the actual interview]`;
    } else {
      userPrompt = `Nicholas answered question ${question_number}: "${current_answer}"

Give 2-3 sentences of specific, honest feedback. Then ask question ${question_number + 1} of ${totalQuestions}.`;
    }

    const messages: Anthropic.MessageParam[] = [];
    for (const ex of (exchanges || [])) {
      if (ex.question) messages.push({ role: 'assistant', content: ex.question });
      if (ex.answer) messages.push({ role: 'user', content: `[Nicholas answered]: ${ex.answer}` });
    }
    messages.push({ role: 'user', content: userPrompt });

    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system,
      messages,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Transfer-Encoding': 'chunked' },
    });
  } catch (error) {
    console.error('Interview API error:', error);
    return NextResponse.json({ error: 'Failed to run interview' }, { status: 500 });
  }
}
