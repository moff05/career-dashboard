'use client';
import { useState, useEffect } from 'react';

export interface UserState {
  userId: string;
  apiKey: string;
  displayName: string;
  isReady: boolean;
  isSetup: boolean;
}

// Initial state must match what the server renders (empty) — real values are
// only read from localStorage after mount, in the effect below, to avoid a
// hydration mismatch between the server-rendered and first client render.
export function useUser(): UserState {
  const [state, setState] = useState<UserState>({ userId: '', apiKey: '', displayName: '', isReady: false, isSetup: false });

  useEffect(() => {
    const userId = localStorage.getItem('cid_user_id') || '';
    const apiKey = localStorage.getItem('cid_api_key') || '';
    const displayName = localStorage.getItem('cid_display_name') || '';
    setState({ userId, apiKey, displayName, isReady: true, isSetup: !!userId });
  }, []);

  return state;
}

export function saveUser(userId: string, apiKey: string) {
  localStorage.setItem('cid_user_id', userId);
  localStorage.setItem('cid_api_key', apiKey);
}

export function clearUser() {
  localStorage.removeItem('cid_user_id');
  localStorage.removeItem('cid_api_key');
}
