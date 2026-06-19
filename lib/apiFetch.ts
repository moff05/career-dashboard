function getStoredCredentials(): { userId: string; apiKey: string } {
  if (typeof window === 'undefined') return { userId: '', apiKey: '' };
  return {
    userId: localStorage.getItem('cid_user_id') || '',
    apiKey: localStorage.getItem('cid_api_key') || '',
  };
}

export function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { userId, apiKey } = getStoredCredentials();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
  }
  if (userId) headers['x-user-id'] = userId;
  if (apiKey) headers['x-api-key'] = apiKey;
  return fetch(url, { ...options, headers });
}
