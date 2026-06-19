import { NextRequest } from 'next/server';

export function getUserId(request: NextRequest): string {
  return request.headers.get('x-user-id') || 'anonymous';
}

export function getApiKey(request: NextRequest): string | null {
  return request.headers.get('x-api-key') || process.env.ANTHROPIC_API_KEY || null;
}
