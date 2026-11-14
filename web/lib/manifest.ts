import type { MetadataRoute } from 'next';

/** Manifeste PWA, servi sur /manifest.webmanifest (app/manifest.webmanifest/route.ts). Couleurs : fond lavande clair de l'application, écran de lancement violet nuit. */
export function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'iGaz CI : le gaz, simplement',
    short_name: 'iGaz CI',
    description:
      'Trouvez une bouteille de gaz disponible près de chez vous, achetez ou échangez, faites-vous livrer ou retirez au dépôt.',
    lang: 'fr',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#140f33',
    theme_color: '#f4f3fa',
    categories: ['shopping', 'utilities'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },    ],
  };
}
