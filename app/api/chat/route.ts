import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { buildSystemPrompt } from '@/lib/ai-context';
import { getUserId, isSystemUser } from '@/lib/user';
import { logUsage } from '@/lib/usage';
import { getAIClient, geminiUsage, GEMINI_MODEL } from '@/lib/groq';
import { isRateLimited, RATE_LIMIT_RESPONSE } from '@/lib/rateLimit';

export const maxDuration = 60;

interface DbMessage { role: string; content: string; }

export async function POST(request: NextRequest) {
  try {
    const userId = getUserId(request);
    if (isSystemUser(userId)) return NextResponse.json({ error: 'Not available' }, { status: 403 });
    if (await isRateLimited(userId)) return NextResponse.json(RATE_LIMIT_RESPONSE, { status: 429 });
    const { message, session_id } = await request.json();
    if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 });
    const db = getDb();
    const systemPrompt = await buildSystemPrompt(userId);
    const sid = session_id || 'default';

    const history = (await db.execute({
      sql: 'SELECT role, content FROM chat_messages WHERE user_id = ? AND session_id = ? ORDER BY created_at ASC LIMIT 50',
      args: [userId, sid],
    })).rows as unknown as DbMessage[];

    await db.execute({
      sql: 'INSERT INTO chat_messages (user_id, role, content, session_id) VALUES (?, ?, ?, ?)',
      args: [userId, 'user', message, sid],
    });

    // Build messages array (OpenAI format — 'assistant' not 'model')
    const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
      { role: 'system', content: systemPrompt },
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: message },
    ];

    const openai = getAIClient();
    const stream = await openai.chat.completions.create({
      model: GEMINI_MODEL,
      messages,
      stream: true,
      stream_options: { include_usage: true },
    });

    const encoder = new TextEncoder();
    let fullResponse = '';
    let finalUsage: { prompt_tokens?: number; completion_tokens?: number } | null = null;

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content || '';
            if (text) {
              fullResponse += text;
              controller.enqueue(encoder.encode(text));
            }
            if (chunk.usage) finalUsage = chunk.usage;
          }
          await db.execute({
            sql: 'INSERT INTO chat_messages (user_id, role, content, session_id) VALUES (?, ?, ?, ?)',
            args: [userId, 'assistant', fullResponse, sid],
          });
          await logUsage(userId, 'coach_chat', GEMINI_MODEL, geminiUsage(finalUsage));
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        'X-Session-Id': sid,
      },
    });
  } catch (error) {
    console.error('POST /api/chat error:', error);
    return NextResponse.json({ error: 'Failed to process chat' }, { status: 500 });
  }
}
