import type { Metadata, Viewport } from 'next';
import { ReactNode } from 'react';
import '@fontsource-variable/plus-jakarta-sans/wght.css';
import './globals.css';
import { Shell } from '@/components/Shell';
import { CartProvider } from '@/lib/cart';
import { NotificationsProvider } from '@/lib/notifications';
import { SessionProvider } from '@/lib/session';
import SPLASH_SCREENS from '@/lib/apple-splash.json';

/** Écrans de lancement iPhone et iPad (npm run splash) : iOS choisit l'image qui correspond exactement à l'écran. */
const startupImage = SPLASH_SCREENS.map(({ w, h, dpr }) => ({
  url: `/splash/apple-splash-${w * dpr}x${h * dpr}.png`,
  media: `(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)`,
}));

export const metadata: Metadata = {
  title: 'iGaz CI : le gaz, simplement',
  description: 'Trouvez une bouteille de gaz disponible près de chez vous, achetez ou échangez, faites-vous livrer ou retirez au dépôt.',
  applicationName: 'iGaz CI',
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  // Barre d'état iPhone classique (texte sombre) : les écrans client ont un fond clair.
  appleWebApp: { capable: true, title: 'iGaz CI', statusBarStyle: 'default', startupImage },
  // iOS n'affiche les écrans de lancement qu'avec cette balise historique (Next n'écrit que « mobile-web-app-capable »).
  other: { 'apple-mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = { themeColor: '#f4f3fa', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        {/* Manifeste avec la connexion du site (démo protégée par Vercel) : voir app/manifest.webmanifest/route.ts */}
        <link rel="manifest" href="/manifest.webmanifest" crossOrigin="use-credentials" />
      </head>
      <body>
        <SessionProvider>
          <CartProvider>
            <NotificationsProvider>
              <Shell>{children}</Shell>
            </NotificationsProvider>
          </CartProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
