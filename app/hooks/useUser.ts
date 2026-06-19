'use client';
import { useState, useEffect } from 'react';

export interface UserState {
  userId: string;
  apiKey: string;
  isReady: boolean;
  isSetup: boolean;
}

export function useUser(): UserState {
  const [state, setState] = useState<UserState>({ userId: '', apiKey: '', isReady: false, isSetup: false });

  useEffect(() => {
    const userId = localStorage.getItem('cid_user_id') || '';
    const apiKey = localStorage.getItem('cid_api_key') || '';
    setState({ userId, apiKey, isReady: true, isSetup: !!(userId && apiKey) });
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
