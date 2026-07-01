import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { buildSystemPrompt } from '@/lib/ai-context';
import { getUserId, isSystemUser } from '@/lib/user';
import { logUsage } from '@/lib/usage';
import { getModel, geminiUsage, GEMINI_MODEL } from '@/lib/gemini';

export const maxDuration = 60;

interface DbMessage { role: string; content: string; }

export async function POST(request: NextRequest) {
  try {
    const userId = getUserId(request);
    if (isSystemUser(userId)) return NextResponse.json({ error: 'Not available' }, { status: 403 });
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

    const model = getModel(systemPrompt);

    // Convert DB history to Gemini format (assistant → model)
    const geminiHistory = history.map(m => ({
      role: m.role === 'assistant' ? 'model' as const : 'user' as const,
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({ history: geminiHistory });

    const encoder = new TextEncoder();
    let fullResponse = '';

    const readable = new ReadableStream({
      async start(controller) {
        try {
          const result = await chat.sendMessageStream(message);
          for await (const chunk of result.stream) {
            const text = chunk.text();
            fullResponse += text;
            controller.enqueue(encoder.encode(text));
          }
          await db.execute({
            sql: 'INSERT INTO chat_messages (user_id, role, content, session_id) VALUES (?, ?, ?, ?)',
            args: [userId, 'assistant', fullResponse, sid],
          });
          const finalResponse = await result.response;
          await logUsage(userId, 'coach_chat', GEMINI_MODEL, geminiUsage(finalResponse.usageMetadata));
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
