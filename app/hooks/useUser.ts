'use client';
import { useState, useEffect } from 'react';

export interface UserState {
  userId: string;
  displayName: string;
  isReady: boolean;
  isSetup: boolean;
}

// Initial state must match what the server renders (empty) — real values are
// only read from localStorage after mount, in the effect below, to avoid a
// hydration mismatch between the server-rendered and first client render.
export function useUser(): UserState {
  const [state, setState] = useState<UserState>({ userId: '', displayName: '', isReady: false, isSetup: false });

  useEffect(() => {
    const userId = localStorage.getItem('cid_user_id') || '';
    const displayName = localStorage.getItem('cid_display_name') || '';
    setState({ userId, displayName, isReady: true, isSetup: !!userId });
  }, []);

  return state;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function saveUser(userId: string, _apiKey?: string) {
  localStorage.setItem('cid_user_id', userId);
}

export function clearUser() {
  localStorage.removeItem('cid_user_id');
}
