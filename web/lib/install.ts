'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * Installation de l'application (PWA) depuis le site, en attendant les stores.
 * - Appli ouverte depuis l'écran d'accueil (ou plus tard depuis le Play Store) : affichage « standalone ».
 * - Chrome (Android, ordinateur) : il propose l'installation par l'événement beforeinstallprompt, gardé ici pour
 *   l'ouvrir au clic sur « Installer l'application ».
 * - iPhone : pas d'invite ; il faut passer par Partager → « Sur l'écran d'accueil » (instructions affichées).
 */

/** Vrai quand on est dans l'application installée, pas dans un onglet de navigateur. */
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: fullscreen)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export type Platform = 'ios' | 'android' | 'desktop';
export function platform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  // iPad récents : se présentent comme un Mac, mais tactiles.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // on garde l'invite pour notre bouton
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => { installed = true; deferred = null; notify(); });
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** État de l'installation, pour le bouton : invite disponible, appli tout juste installée. */
export function useInstall() {
  const canPrompt = useSyncExternalStore(subscribe, () => deferred !== null, () => false);
  const justInstalled = useSyncExternalStore(subscribe, () => installed, () => false);
  const [where, setWhere] = useState<Platform>('desktop');
  useEffect(() => setWhere(platform()), []);

  /** Ouvre l'invite de Chrome. Renvoie false si elle n'est pas disponible (afficher alors les instructions). */
  async function install() {
    if (!deferred) return false;
    const e = deferred;
    deferred = null;
    notify();
    await e.prompt();
    const { outcome } = await e.userChoice;
    if (outcome === 'accepted') { installed = true; notify(); }
    return true;
  }

  return { canPrompt, justInstalled, platform: where, install };
}

/** Choix « Utiliser dans le navigateur » : on ne remontre plus la présentation à l'ouverture du site. */
const WEB_KEY = 'igaz.web';
export const prefersWeb = () => { try { return localStorage.getItem(WEB_KEY) === '1'; } catch { return false; } };
export const choseWeb = () => { try { localStorage.setItem(WEB_KEY, '1'); } catch { /* sans stockage : redemandé */ } };
