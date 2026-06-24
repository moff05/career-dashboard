import { NextRequest } from 'next/server';

export function getUserId(request: NextRequest): string {
  return request.headers.get('x-user-id') || 'anonymous';
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
