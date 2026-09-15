import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { HandwritingProfile } from '../engine/types';
import { KV_KEYS, getProfile, kvGet, kvSet, listProfiles } from '../storage/db';

interface AppState {
  profile: HandwritingProfile | null;
  loading: boolean;
  setActiveProfile: (p: HandwritingProfile | null) => Promise<void>;
  reloadProfile: () => Promise<void>;
}

const Ctx = createContext<AppState>({
  profile: null,
  loading: true,
  setActiveProfile: async () => undefined,
  reloadProfile: async () => undefined,
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<HandwritingProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const reloadProfile = useCallback(async () => {
    const activeId = await kvGet<string | null>(KV_KEYS.activeProfileId, null);
    if (activeId) {
      const p = await getProfile(activeId);
      if (p) {
        setProfile(p);
        setLoading(false);
        return;
      }
    }
    const all = await listProfiles();
    const own = all.find((p) => !p.isDemo) ?? all[0] ?? null;
    if (own) await kvSet(KV_KEYS.activeProfileId, own.id);
    setProfile(own);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reloadProfile();
  }, [reloadProfile]);

  const setActiveProfile = useCallback(async (p: HandwritingProfile | null) => {
    await kvSet(KV_KEYS.activeProfileId, p ? p.id : null);
    setProfile(p);
  }, []);

  return <Ctx.Provider value={{ profile, loading, setActiveProfile, reloadProfile }}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  return useContext(Ctx);
}
