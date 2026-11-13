'use client';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';
import { Role, User } from './types';

interface Session {
  user: User | null;
  ready: boolean;
  /** Le visiteur a choisi « Continuer sans compte » : l'écran de connexion ne s'impose plus à l'ouverture. */
  guest: boolean;
  continueAsGuest: () => void;
  signIn: (token: string) => Promise<User>;
  signOut: () => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

const GUEST_KEY = 'igaz.guest';
const readGuest = () => { try { return localStorage.getItem(GUEST_KEY) === '1'; } catch { return false; } };
const writeGuest = (on: boolean) => {
  try { if (on) localStorage.setItem(GUEST_KEY, '1'); else localStorage.removeItem(GUEST_KEY); } catch { /* stockage indisponible */ }
};

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [guest, setGuest] = useState(false);

  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); return; }
    try {
      setUser(await api<User>('/auth/me'));
    } catch {
      setToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    setGuest(readGuest());
    refresh().finally(() => setReady(true));
  }, [refresh]);

  const signIn = useCallback(async (token: string) => {
    setToken(token);
    const me = await api<User>('/auth/me');
    writeGuest(false); setGuest(false);
    setUser(me);
    return me;
  }, []);

  // Après une déconnexion, l'application rouvre sur l'écran de connexion (même pour un ancien visiteur sans compte).
  const signOut = useCallback(() => { setToken(null); setUser(null); writeGuest(false); setGuest(false); }, []);
  const continueAsGuest = useCallback(() => { writeGuest(true); setGuest(true); }, []);

  return (
    <Ctx.Provider value={{ user, ready, guest, continueAsGuest, signIn, signOut, refresh }}>{children}</Ctx.Provider>
  );
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('SessionProvider manquant');
  return v;
}

export const homeFor = (role: Role) => (role === 'ADMIN' ? '/admin' : role === 'SUPPLIER' ? '/fournisseur' : '/');
