import { manifest } from '@/lib/manifest';

/**
 * Manifeste PWA. Servi par une route (et non par app/manifest.ts) pour que le lien soit déclaré dans layout.tsx avec
 * crossOrigin="use-credentials" : sinon le navigateur le télécharge sans la connexion Vercel du site de démo protégé,
 * reçoit la page de connexion de Vercel et ne propose jamais l'installation. Sans effet sur un site public.
 */
export const dynamic = 'force-static';

export function GET() {
  return new Response(JSON.stringify(manifest()), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
}
