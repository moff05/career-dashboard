import { apiFetch } from '@/lib/apiFetch';

// Client-side usage ping. Never throws, never blocks the UI. See lib/events.ts
// for exactly what is (and isn't) recorded.
export function track(event: string, detail?: string) {
  try {
    apiFetch('/api/track', { method: 'POST', body: JSON.stringify({ event, detail }), keepalive: true }).catch(() => {});
  } catch { /* ignore */ }
}
