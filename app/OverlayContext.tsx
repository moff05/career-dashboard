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
  tutorialOpen: boolean;
  openTutorial: () => void;
  closeTutorial: () => void;
}

const OverlayContext = createContext<OverlayState | null>(null);

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [coachOpen, setCoachOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileTab, setProfileTab] = useState('resume');
  const [coachPrefill, setCoachPrefill] = useState('');
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [connectionsPrefillCompany, setConnectionsPrefillCompany] = useState('');
  const [tutorialOpen, setTutorialOpen] = useState(false);

  const openCoach = useCallback((prefill?: string) => { setCoachPrefill(prefill || ''); setCoachOpen(true); }, []);
  const closeCoach = useCallback(() => setCoachOpen(false), []);
  const openProfile = useCallback((tab?: string) => { setProfileTab(tab || 'resume'); setProfileOpen(true); }, []);
  const closeProfile = useCallback(() => setProfileOpen(false), []);
  const openConnections = useCallback((prefillCompany?: string) => { setConnectionsPrefillCompany(prefillCompany || ''); setConnectionsOpen(true); }, []);
  const closeConnections = useCallback(() => setConnectionsOpen(false), []);
  const openTutorial = useCallback(() => setTutorialOpen(true), []);
  const closeTutorial = useCallback(() => setTutorialOpen(false), []);

  return (
    <OverlayContext.Provider value={{
      coachOpen, profileOpen, profileTab, openCoach, closeCoach, coachPrefill, openProfile, closeProfile,
      connectionsOpen, connectionsPrefillCompany, openConnections, closeConnections,
      tutorialOpen, openTutorial, closeTutorial,
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
