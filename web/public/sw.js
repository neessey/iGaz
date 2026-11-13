/*
 * iGaz : service worker, mode hors ligne minimal.
 *
 * - Les appels à l'API (autre origine) ne passent jamais par ici : le stock, les prix et les commandes
 *   restent toujours en direct, jamais servis depuis un cache.
 * - Les pages ne sont pas mises en cache. Si une page ne peut pas être chargée faute de réseau, on affiche
 *   la page « Pas de connexion » (/hors-ligne), téléchargée à l'installation avec ses styles, scripts et polices.
 * - Chaque déploiement enregistre /sw.js?v=<version> : nouvelle version → nouveaux caches, anciens supprimés.
 */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = `igaz-${VERSION}`;
const OFFLINE_URL = '/hors-ligne';
const PRECACHE = [
  '/manifest.webmanifest',
  '/images/logo-mark-96.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/favicon-32.png',
];

/** Repère les fichiers /_next/static/… cités dans un texte (HTML ou CSS). */
const staticUrls = (text) => text.match(/\/_next\/static\/[^"'\s\\)]+/g) || [];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const page = await fetch(OFFLINE_URL, { cache: 'reload' });
      if (!page.ok) throw new Error(`Page hors ligne indisponible (${page.status})`);
      const html = await page.clone().text();
      await cache.put(OFFLINE_URL, page);

      // Styles et scripts de la page hors ligne, puis polices citées dans les feuilles de style.
      const assets = new Set(staticUrls(html));
      for (const css of [...assets].filter((u) => u.endsWith('.css'))) {
        const res = await fetch(css).catch(() => null);
        if (res && res.ok) {
          for (const u of staticUrls(await res.clone().text())) assets.add(u);
          await cache.put(css, res);
          assets.delete(css);
        }
      }
      // Un fichier manquant ne doit pas empêcher l'installation : la page resterait lisible.
      await Promise.allSettled([...PRECACHE, ...assets].map((u) => cache.add(u)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith('igaz-') && n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

// Notifications push (nouvelle commande pour un dépôt, étapes de commande pour un client).
self.addEventListener('push', (event) => {
  let data = { title: 'iGaz CI', body: '', url: '/' };
  try { data = { ...data, ...event.data.json() }; } catch { /* message vide ou illisible : texte par défaut */ }
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/favicon-32.png',
    data: { url: data.url },
    lang: 'fr',
  }));
});

// Toucher la notification ouvre la page concernée (en réutilisant un onglet de l'application s'il existe).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find((w) => w.url.startsWith(self.location.origin));
    if (win) { await win.focus(); return win.navigate(url); }
    return self.clients.openWindow(url);
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigation : toujours le réseau ; la page hors ligne seulement si le réseau ne répond pas.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error()),
    );
    return;
  }

  // Fichiers déjà téléchargés pour la page hors ligne (noms uniques par version) : cache d'abord.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/images/') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
  }
});
