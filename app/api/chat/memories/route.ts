import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '@/lib/db';
import { getUserId, getApiKey } from '@/lib/user';
import { logUsage } from '@/lib/usage';



interface ExtractedMemory { content: string; category: string; }

export async function POST(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const apiKey = getApiKey(request);
    const anthropic = new Anthropic({ apiKey: apiKey || '' });
    const { message, response, session_id } = await request.json();

    const completion = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: `Extract any new information about the user from this conversation exchange that would help a career coach know them better. Return as JSON array: [{"content": string, "category": "preference"|"goal"|"insight"|"company"|"role"|"location"|"skill"|"other"}]. Return empty array [] if nothing worth saving.

User said: ${message}
Assistant said: ${response}

Return ONLY the JSON array.`,
      }],
    });
    await logUsage(userId, 'memory_extraction', 'claude-haiku-4-5-20251001', completion.usage);

    const responseText = completion.content[0].type === 'text' ? completion.content[0].text : '[]';
    let memories: ExtractedMemory[] = [];
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) memories = JSON.parse(jsonMatch[0]);
    } catch { memories = []; }

    if (memories.length > 0) {
      const db = getDb();
      for (const mem of memories) {
        if (mem.content && mem.category) {
          await db.execute({
            sql: 'INSERT INTO memories (user_id, content, category, source) VALUES (?, ?, ?, ?)',
            args: [userId, mem.content, mem.category, session_id || 'conversation'],
          });
        }
      }
    }

    return NextResponse.json({ saved: memories.length, memories });
  } catch (error) {
    console.error('POST /api/chat/memories error:', error);
    return NextResponse.json({ saved: 0, memories: [] });
  }
}
