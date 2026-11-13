'use client';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';
import { Role, User } from './types';

interface Session {
  user: User | null;
  ready: boolean;
  signIn: (token: string) => Promise<User>;
  signOut: () => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); return; }
    try {
      setUser(await api<User>('/auth/me'));
    } catch {
      setToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => { refresh().finally(() => setReady(true)); }, [refresh]);

  const signIn = useCallback(async (token: string) => {
    setToken(token);
    const me = await api<User>('/auth/me');
    setUser(me);
    return me;
  }, []);

  const signOut = useCallback(() => { setToken(null); setUser(null); }, []);

  return <Ctx.Provider value={{ user, ready, signIn, signOut, refresh }}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('SessionProvider manquant');
  return v;
}

export const homeFor = (role: Role) => (role === 'ADMIN' ? '/admin' : role === 'SUPPLIER' ? '/fournisseur' : '/');
