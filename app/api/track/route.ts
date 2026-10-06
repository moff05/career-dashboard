import { NextRequest, NextResponse } from 'next/server';
import { getUserId, isSystemUser } from '@/lib/user';
import { recordEvent, sanitizeEvent } from '@/lib/events';

// Fire-and-forget feature-usage ping. Only counts for requests that carry a
// real x-user-id (getUserId would otherwise mint a throwaway id per request).
export async function POST(request: NextRequest) {
  if (!request.headers.get('x-user-id')) return new NextResponse(null, { status: 204 });
  const userId = getUserId(request);
  if (isSystemUser(userId)) return new NextResponse(null, { status: 204 });
  try {
    const body = await request.json();
    const clean = sanitizeEvent(body?.event, body?.detail);
    if (clean) await recordEvent(userId, clean.event, clean.detail);
  } catch {
    // analytics must never surface errors
  }
  return new NextResponse(null, { status: 204 });
}
