import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';

export function getUserId(request: NextRequest): string {
  const headerId = request.headers.get('x-user-id');
  if (headerId) return headerId;
  // No identity supplied. The old fallback was the literal string
  // 'anonymous' — a single shared bucket every header-less caller landed
  // in together, so two different callers who both omitted the header
  // would see and overwrite each other's data. A fresh random id per
  // request means a header-less request only ever touches its own
  // (empty) slice — isolated, not shared, and with no special-casing
  // needed in the ~30 routes that call this.
  return randomUUID();
}

// Returns true for synthetic user IDs injected by deploy hooks or health checks.
// AI routes should reject these before making any API calls.
export function isSystemUser(userId: string): boolean {
  return userId.startsWith('__');
}

