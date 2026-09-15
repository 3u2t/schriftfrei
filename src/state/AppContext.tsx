import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { HandwritingProfile } from '../engine/types';
import { KV_KEYS, getProfile, kvGet, kvSet, listProfiles } from '../storage/db';

interface AppState {
  profile: HandwritingProfile | null;
  loading: boolean;
  setActiveProfile: (p: HandwritingProfile | null) => Promise<void>;
  reloadProfile: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<HandwritingProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const reloadProfile = useCallback(async () => {
    try {
      const activeId = await kvGet<string | null>(KV_KEYS.activeProfileId, null);
      if (activeId) {
        const p = await getProfile(activeId);
        if (p) {
          if (mounted.current) {
            setProfile(p);
            setLoading(false);
          }
          return;
        }
      }
      const all = await listProfiles();
      const own = all.find((p) => !p.isDemo) ?? all[0] ?? null;
      if (own) await kvSet(KV_KEYS.activeProfileId, own.id);
      else await kvSet(KV_KEYS.activeProfileId, null);
      if (mounted.current) {
        setProfile(own);
        setLoading(false);
      }
    } catch {
      // IndexedDB nicht verfügbar (Privatmodus etc.) – App bleibt benutzbar.
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadProfile();
  }, [reloadProfile]);

  const setActiveProfile = useCallback(async (p: HandwritingProfile | null) => {
    setProfile(p);
    try {
      await kvSet(KV_KEYS.activeProfileId, p ? p.id : null);
    } catch {
      // Auswahl gilt nur für diese Sitzung.
    }
  }, []);

  const value = useMemo(
    () => ({ profile, loading, setActiveProfile, reloadProfile }),
    [profile, loading, setActiveProfile, reloadProfile],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp nur innerhalb von <AppProvider> verwenden.');
  return ctx;
}
