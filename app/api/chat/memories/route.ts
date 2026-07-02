import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId, isSystemUser } from '@/lib/user';
import { logUsage } from '@/lib/usage';
import { getModel, geminiUsage, GEMINI_MODEL } from '@/lib/groq';

interface ExtractedMemory { content: string; category: string; }

export async function POST(request: NextRequest) {
  try {
    const userId = getUserId(request);
    if (isSystemUser(userId)) return NextResponse.json({ error: 'Not available' }, { status: 403 });
    const { message, response, session_id } = await request.json();

    const { client } = getModel();
    const completion = await client.chat.completions.create({
      model: GEMINI_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user' as const,
        content: `Extract any new information about the user from this conversation exchange that would help a career coach know them better. Return as a JSON object with a "memories" array. Return {"memories":[]} if nothing worth saving.

User said: ${message}
Assistant said: ${response}

Return ONLY valid JSON, no other text:
{"memories":[{"content":"string","category":"preference|goal|insight|company|role|location|skill|other"}]}`,
      }],
    });
    await logUsage(userId, 'memory_extraction', GEMINI_MODEL, geminiUsage(completion.usage));

    const responseText = completion.choices[0]?.message?.content || '{}';
    let memories: ExtractedMemory[] = [];
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed.memories)) memories = parsed.memories;
      }
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
