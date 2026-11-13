import type { Metadata, Viewport } from 'next';
import { ReactNode } from 'react';
import '@fontsource/big-shoulders-display/latin-700';
import '@fontsource/big-shoulders-display/latin-800';
import '@fontsource/atkinson-hyperlegible/latin-400';
import '@fontsource/atkinson-hyperlegible/latin-700';
import './globals.css';
import { Shell } from '@/components/Shell';
import { SessionProvider } from '@/lib/session';

export const metadata: Metadata = {
  title: 'iGaz : bouteilles de gaz à Abidjan',
  description: 'Trouvez une bouteille de gaz disponible près de chez vous, achetez ou échangez, faites-vous livrer ou retirez au dépôt.',
};

export const viewport: Viewport = { themeColor: '#10201c', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <SessionProvider>
          <Shell>{children}</Shell>
        </SessionProvider>
      </body>
    </html>
  );
}
