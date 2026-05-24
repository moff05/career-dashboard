import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '@/lib/db';
import { buildSystemPrompt } from '@/lib/ai-context';
import { getResumeText } from '@/lib/resume-parser';

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface DbMessage { role: string; content: string; }

export async function POST(request: NextRequest) {
  try {
    const { message, session_id } = await request.json();
    if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 });

    await getResumeText();

    const db = getDb();
    const systemPrompt = await buildSystemPrompt();
    const sid = session_id || 'default';

    const history = (await db.execute({
      sql: 'SELECT role, content FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC LIMIT 20',
      args: [sid],
    })).rows as unknown as DbMessage[];

    await db.execute({
      sql: 'INSERT INTO chat_messages (role, content, session_id) VALUES (?, ?, ?)',
      args: ['user', message, sid],
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
            sql: 'INSERT INTO chat_messages (role, content, session_id) VALUES (?, ?, ?)',
            args: ['assistant', fullResponse, sid],
          });
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
