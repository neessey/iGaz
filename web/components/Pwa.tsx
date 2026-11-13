'use client';
import { useEffect, useSyncExternalStore } from 'react';

/**
 * Enregistre le service worker (public/sw.js) en production seulement : en développement, il gênerait
 * le rechargement à chaud. La version change à chaque build, ce qui renouvelle la page hors ligne en cache.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') {
      // Un essai en production sur la même adresse a pu en laisser un : on le retire en développement.
      navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister())).catch(() => {});
      return;
    }
    const version = process.env.NEXT_PUBLIC_SW_VERSION ?? 'dev';
    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(version)}`).catch(() => {
      /* sans service worker, le site fonctionne normalement, sans page hors ligne */
    });
  }, []);
  return null;
}

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** Bandeau affiché quand le téléphone perd le réseau : les données à l'écran peuvent ne plus être à jour. */
export function OfflineNotice() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  return (
    <div role="status" className="offline-note-slot">
      {!online && (
        <p className="notice notice-error offline-note">
          Pas de connexion. Le stock et les prix affichés ont peut-être changé : réessayez quand le réseau revient.
        </p>
      )}
    </div>
  );
}
