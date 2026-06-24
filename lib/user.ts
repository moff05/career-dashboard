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

export function getApiKey(request: NextRequest): string | null {
  const headerKey = request.headers.get('x-api-key');
  if (headerKey) return headerKey;
  // Admin/dev convenience only — gated out of production so a request with
  // no key of its own fails closed instead of silently billing whatever
  // ANTHROPIC_API_KEY happens to be configured on the deployment.
  if (process.env.NODE_ENV !== 'production') return process.env.ANTHROPIC_API_KEY || null;
  return null;
}
