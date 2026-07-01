import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getUserId, isSystemUser } from '@/lib/user';
import { logUsage } from '@/lib/usage';
import { getModel, geminiUsage, GEMINI_MODEL } from '@/lib/gemini';

interface ExtractedMemory { content: string; category: string; }

export async function POST(request: NextRequest) {
  try {
    const userId = getUserId(request);
    if (isSystemUser(userId)) return NextResponse.json({ error: 'Not available' }, { status: 403 });
    const { message, response, session_id } = await request.json();

    const model = getModel();
    const completion = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [{ text: `Extract any new information about the user from this conversation exchange that would help a career coach know them better. Return as JSON array: [{"content": string, "category": "preference"|"goal"|"insight"|"company"|"role"|"location"|"skill"|"other"}]. Return empty array [] if nothing worth saving.

User said: ${message}
Assistant said: ${response}

Return ONLY the JSON array.` }],
      }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    });
    await logUsage(userId, 'memory_extraction', GEMINI_MODEL, geminiUsage(completion.response.usageMetadata));

    const responseText = completion.response.text();
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
