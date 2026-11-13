# iGaz — interface web (MVP)

Next.js 15 (App Router) + TypeScript. Application responsive pensée d'abord pour le téléphone (premier chargement ≈ 110 ko de JS).

## Démarrage

```bash
cd web
cp .env.example .env.local     # NEXT_PUBLIC_API_URL=http://localhost:3000
npm install
npm run dev                    # http://localhost:3001
```

Il faut l'API en route (voir `../backend/README.md`). Pour essayer sans SMS : lancer l'API avec `EXPOSE_DEV_OTP=true` et
`npm run seed:demo` côté backend ; l'écran de connexion affiche alors le code.

## Pages

| Espace | Pages |
| --- | --- |
| Client | `/` recherche (taille, mode, commune, marque) · `/produit/[id]` commande achat ou échange, livraison ou retrait, paiement · `/panier` panier multi-dépôts (gardé dans le téléphone, 3 dépôts au plus) · `/panier/valider` mode par dépôt, adresse, paiement · `/commandes/panier/[id]` paiement unique et suivi des commandes du panier · `/commandes` et `/commandes/[id]` suivi, code de remise, annulation · `/profil` compte et déconnexion (tous rôles) |
| Fournisseur | `/fournisseur` commandes (accepter, refuser, livrer, saisir le code) · `/fournisseur/stock` mise à jour rapide du stock et des prix · `/fournisseur/boutique` · `/fournisseur/inscription` |
| Administration | `/admin` chiffres et validation des fournisseurs · `/admin/catalogue` · `/admin/commandes` · `/admin/audit` |

## Notes

- La session est un jeton JWT gardé dans `localStorage` ; l'API relit le rôle à chaque requête.
- Le paiement mobile money affiche « pas encore branché » tant que l'agrégateur n'est pas intégré côté API (`checkoutUrl` vide).
- Les polices sont embarquées (`@fontsource-variable/plus-jakarta-sans`), aucune requête vers un service externe.
- Photos et logos : déposer les fichiers dans `public/images/` puis les déclarer dans `lib/media.ts` (photo de l'écran de
  connexion, bannière d'accueil, fond de la fiche produit, logos des marques, photos des dépôts). Sans fichier,
  l'interface affiche une illustration dessinée. N'utiliser que des images dont iGaz a les droits.

## Application installable (PWA)

- Logo : sources officielles dans `../docs/logo/`. `npm run logo` détoure le pictogramme (retire la tache noire du fond)
  et écrit `public/images/logo-mark*.{png,webp}` ; le texte « Gaz CI » est écrit en vrai texte à côté (`components/Logo.tsx`).
- Manifeste : `app/manifest.ts` (servi sur `/manifest.webmanifest`). Icônes dans `public/icons/` (pictogramme sur fond
  violet nuit) ; pour les refaire après `npm run logo` : `npm run icons` (script `scripts/generate-icons.mjs`).
- Service worker : `public/sw.js`, enregistré **en production seulement** (`npm run build && npm start`) ; en
  développement il est désinstallé pour ne pas gêner le rechargement à chaud.
- Mode hors ligne minimal : les appels à l'API ne sont jamais mis en cache (stock et prix toujours en direct). Si une
  page ne charge pas faute de réseau, le service worker affiche `/hors-ligne` (« Pas de connexion », bouton
  « Réessayer »), téléchargée à l'installation avec ses styles, scripts et polices. Un bandeau prévient aussi quand le
  téléphone perd le réseau sur une page déjà ouverte.
- Chaque build change la version du service worker (`NEXT_PUBLIC_SW_VERSION` dans `next.config.mjs`) : les anciens
  caches sont supprimés.
