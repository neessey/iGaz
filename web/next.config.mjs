/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Version du service worker : change à chaque build pour renouveler la page hors ligne en cache.
  env: { NEXT_PUBLIC_SW_VERSION: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? String(Date.now()) },
  async headers() {
    return [
      {
        // Le navigateur doit toujours revérifier le service worker, sinon une mise à jour peut tarder.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
    ];
  },
};
export default nextConfig;
