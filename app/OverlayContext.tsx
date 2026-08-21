'use client';

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
  openConnections: (prefillCompany?: string) => void;
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
  const [companiesOpen, setCompaniesOpen] = useState(false);
  const openCoach = useCallback((prefill?: string) => { setCoachPrefill(prefill || ''); setProfileOpen(false); setConnectionsOpen(false); setCompaniesOpen(false); setCoachOpen(true); }, []);
  const closeCoach = useCallback(() => setCoachOpen(false), []);
  const openProfile = useCallback((tab?: string) => { setProfileTab(tab || 'resume'); setCoachOpen(false); setConnectionsOpen(false); setCompaniesOpen(false); setProfileOpen(true); }, []);
  const closeProfile = useCallback(() => setProfileOpen(false), []);
  const openConnections = useCallback((prefillCompany?: string) => { setConnectionsPrefillCompany(prefillCompany || ''); setCoachOpen(false); setProfileOpen(false); setCompaniesOpen(false); setConnectionsOpen(true); }, []);
  const closeConnections = useCallback(() => setConnectionsOpen(false), []);
  const openCompanies = useCallback(() => { setCoachOpen(false); setProfileOpen(false); setConnectionsOpen(false); setCompaniesOpen(true); }, []);
  const closeCompanies = useCallback(() => setCompaniesOpen(false), []);
  return (
    <OverlayContext.Provider value={{
      coachOpen, profileOpen, profileTab, openCoach, closeCoach, coachPrefill, openProfile, closeProfile,
      connectionsOpen, connectionsPrefillCompany, openConnections, closeConnections,
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
