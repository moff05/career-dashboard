import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '@/lib/db';
import { buildSystemPrompt } from '@/lib/ai-context';
import { getUserId, getApiKey, isSystemUser } from '@/lib/user';
import { logUsage } from '@/lib/usage';

export const maxDuration = 60;



interface DbMessage { role: string; content: string; }


export async function POST(request: NextRequest) {
  try {
    const userId = getUserId(request);
    if (isSystemUser(userId)) return NextResponse.json({ error: 'Not available' }, { status: 403 });    const apiKey = getApiKey(request);
    if (!apiKey) return NextResponse.json({ error: 'API key required' }, { status: 401 });
    const anthropic = new Anthropic({ apiKey });
    const { message, session_id } = await request.json();
    if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 });
    const db = getDb();
    const systemPrompt = await buildSystemPrompt(userId);
    const sid = session_id || 'default';

    const history = (await db.execute({
      sql: 'SELECT role, content FROM chat_messages WHERE user_id = ? AND session_id = ? ORDER BY created_at ASC LIMIT 20',
      args: [userId, sid],
    })).rows as unknown as DbMessage[];

    await db.execute({
      sql: 'INSERT INTO chat_messages (user_id, role, content, session_id) VALUES (?, ?, ?, ?)',
      args: [userId, 'user', message, sid],
    });

    const messages: Anthropic.MessageParam[] = [
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: message },
    ];

    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages,
    });

    const encoder = new TextEncoder();
    let fullResponse = '';

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              fullResponse += event.delta.text;
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          await db.execute({
            sql: 'INSERT INTO chat_messages (user_id, role, content, session_id) VALUES (?, ?, ?, ?)',
            args: [userId, 'assistant', fullResponse, sid],
          });
          const finalMessage = await stream.finalMessage();
          await logUsage(userId, 'coach_chat', 'claude-sonnet-4-6', finalMessage.usage);
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
