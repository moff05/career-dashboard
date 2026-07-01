function getStoredUserId(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('cid_user_id') || '';
}

export function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const userId = getStoredUserId();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
  }
  if (userId) headers['x-user-id'] = userId;
  return fetch(url, { ...options, headers });
}
