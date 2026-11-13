'use client';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';
import { useSession } from './session';

export interface AppNotification {
  id: string; kind: string; title: string; body: string; url: string | null; orderId: string | null;
  readAt: string | null; createdAt: string;
}

interface Notifications {
  unread: number;
  items: AppNotification[] | null;
  reload: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const Ctx = createContext<Notifications | null>(null);
const POLL_MS = 30_000;

/** Notifications de l'utilisateur connecté : relues toutes les 30 s et au retour sur l'application. */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [unread, setUnread] = useState(0);

  const reload = useCallback(async () => {
    if (!user) { setItems(null); setUnread(0); return; }
    try {
      const r = await api<{ unread: number; items: AppNotification[] }>('/notifications');
      setItems(r.items); setUnread(r.unread);
    } catch { /* hors ligne : on garde l'état précédent */ }
  }, [user]);

  useEffect(() => {
    reload();
    if (!user) return;
    const t = setInterval(reload, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [user, reload]);

  const markRead = useCallback(async (id: string) => {
    setItems((cur) => cur?.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n)) ?? cur);
    setUnread((u) => Math.max(0, u - 1));
    await api(`/notifications/${id}/read`, { method: 'POST', body: {} }).catch(() => undefined);
  }, []);

  const markAllRead = useCallback(async () => {
    setItems((cur) => cur?.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })) ?? cur);
    setUnread(0);
    await api('/notifications/read-all', { method: 'POST', body: {} }).catch(() => undefined);
  }, []);

  return <Ctx.Provider value={{ unread, items, reload, markRead, markAllRead }}>{children}</Ctx.Provider>;
}

export function useNotifications() {
  const v = useContext(Ctx);
  if (!v) throw new Error('NotificationsProvider manquant');
  return v;
}

// ------------------------------------------------------------------ push sur le téléphone

export type PushState = 'unsupported' | 'not-installed' | 'denied' | 'off' | 'on' | 'not-configured';

const toKey = (base64: string) => {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

/** État du push sur cet appareil. Le push passe par le service worker, actif seulement dans la version publiée. */
export async function pushState(): Promise<PushState> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return 'not-installed';
  const { publicKey } = await api<{ publicKey: string | null }>('/notifications/push-key');
  if (!publicKey) return 'not-configured';
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
}

/** Demande l'autorisation, abonne ce téléphone et l'enregistre sur le compte. */
export async function enablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return 'not-installed';
  const { publicKey } = await api<{ publicKey: string | null }>('/notifications/push-key');
  if (!publicKey) return 'not-configured';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) });
  const json = sub.toJSON();
  await api('/notifications/push-subscriptions', { body: { endpoint: json.endpoint, keys: json.keys } });
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api('/notifications/push-subscriptions', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(() => undefined);
    await sub.unsubscribe();
  }
  return 'off';
}
