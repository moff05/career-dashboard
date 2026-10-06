'use client';

import { track } from '@/lib/track';
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface OverlayState {
  coachOpen: boolean;
  profileOpen: boolean;
  profileTab: string;
  openCoach: (prefill?: string) => void;
  closeCoach: () => void;
  coachPrefill: string;
  openProfile: (tab?: string) => void;
  closeProfile: () => void;
  connectionsOpen: boolean;
  connectionsPrefillCompany: string;
  connectionsFocusQuery: string;
  openConnections: (prefillCompany?: string, focusQuery?: string) => void;
  closeConnections: () => void;
  companiesOpen: boolean;
  openCompanies: () => void;
  closeCompanies: () => void;
}

const OverlayContext = createContext<OverlayState | null>(null);

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [coachOpen, setCoachOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileTab, setProfileTab] = useState('resume');
  const [coachPrefill, setCoachPrefill] = useState('');
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [connectionsPrefillCompany, setConnectionsPrefillCompany] = useState('');
  const [connectionsFocusQuery, setConnectionsFocusQuery] = useState('');
  const [companiesOpen, setCompaniesOpen] = useState(false);
  const openCoach = useCallback((prefill?: string) => { track('overlay_coach'); setCoachPrefill(prefill || ''); setProfileOpen(false); setConnectionsOpen(false); setCompaniesOpen(false); setCoachOpen(true); }, []);
  const closeCoach = useCallback(() => setCoachOpen(false), []);
  const openProfile = useCallback((tab?: string) => { track('overlay_profile'); setProfileTab(tab || 'resume'); setCoachOpen(false); setConnectionsOpen(false); setCompaniesOpen(false); setProfileOpen(true); }, []);
  const closeProfile = useCallback(() => setProfileOpen(false), []);
  // focusQuery (e.g. from a Priorities "Reach out" item) pre-fills the search
  // box to jump straight to that connection, instead of prefillCompany's
  // behavior of opening the add-a-connection form.
  const openConnections = useCallback((prefillCompany?: string, focusQuery?: string) => { track('overlay_connections'); setConnectionsPrefillCompany(prefillCompany || ''); setConnectionsFocusQuery(focusQuery || ''); setCoachOpen(false); setProfileOpen(false); setCompaniesOpen(false); setConnectionsOpen(true); }, []);
  const closeConnections = useCallback(() => setConnectionsOpen(false), []);
  const openCompanies = useCallback(() => { track('overlay_companies'); setCoachOpen(false); setProfileOpen(false); setConnectionsOpen(false); setCompaniesOpen(true); }, []);
  const closeCompanies = useCallback(() => setCompaniesOpen(false), []);
  return (
    <OverlayContext.Provider value={{
      coachOpen, profileOpen, profileTab, openCoach, closeCoach, coachPrefill, openProfile, closeProfile,
      connectionsOpen, connectionsPrefillCompany, connectionsFocusQuery, openConnections, closeConnections,
      companiesOpen, openCompanies, closeCompanies,
    }}>
      {children}
    </OverlayContext.Provider>
  );
}

export function useOverlays() {
  const ctx = useContext(OverlayContext);
  if (!ctx) throw new Error('useOverlays must be used within OverlayProvider');
  return ctx;
}
