/**
 * Digital Asset Links : prouve à Android que l'application Play Store (Trusted Web Activity) et ce site
 * appartiennent au même propriétaire, pour ouvrir le site en plein écran, sans barre d'adresse.
 *
 * Variables d'environnement (sur le serveur web en production) :
 * - ANDROID_PACKAGE_NAME : identifiant de l'application, ex. ci.igaz.app
 * - ANDROID_SHA256_FINGERPRINTS : empreintes SHA-256 des certificats de signature, séparées par des virgules
 *   (clé d'importation ET clé de signature de Google Play App Signing). Voir docs/android.md.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  const pkg = process.env.ANDROID_PACKAGE_NAME;
  const prints = (process.env.ANDROID_SHA256_FINGERPRINTS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!pkg || prints.length === 0) {
    return Response.json({ error: 'Application Android non configurée' }, { status: 404 });
  }
  return Response.json([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: prints },
  }]);
}
