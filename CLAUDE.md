# iGaz — contexte pour Claude Code

Marketplace de gaz domestique en Côte d'Ivoire (Abidjan d'abord). Le propriétaire du projet parle français :
messages d'erreur, textes d'interface et documentation sont **en français**.

## Références

- Périmètre du MVP (source de vérité) : `docs/iGaz_MVP_Cahier_des_charges.pdf` (.docx)
- Vision complète à long terme : `docs/iGaz_Cahier_des_charges.pdf`
- Tout ce qui est « reporté » dans le cahier MVP (livreurs plateforme, commissions, abonnements, multi-fournisseurs,
  messagerie, avis, litiges) ne doit **pas** être développé sans accord explicite.
  Le 13/11/2026, le propriétaire a donné son accord pour développer ceux que montre la maquette (messagerie, avis et notes,
  espace livreur, abonnements, promotions, panier multi-dépôts), **chacun après validation d'un plan** (base + API + interface).
  Commissions et litiges restent reportés. Fait : panier multi-dépôts. Ordre proposé ensuite : avis et notes, promotions,
  messagerie, espace livreur, abonnements.

## Structure

- `backend/` : API NestJS + Prisma + PostgreSQL
- `web/` : interface Next.js (App Router, TypeScript), PWA responsive, mobile d'abord. Trois espaces : client (`/`, `/produit/[id]`,
  `/depot/[id]`, `/panier`, `/commandes`, `/profil`), fournisseur (`/fournisseur/*`), administration (`/admin/*`).
  Parcours client façon appli de livraison : on choisit un dépôt, on ajoute avec « + », barre panier flottante
  (s'inspirer des usages de ces applis, sans reprendre la marque ni le visuel d'une autre). Design : voir « Design » ci-dessous.
  Site ou application : ouvert dans un navigateur, `/` mène au site de présentation `/presentation` (bouton « Installer
  l'application », `lib/install.ts`), sauf visiteur connecté ou ayant choisi le navigateur ; l'application installée
  (affichage standalone : écran d'accueil, plus tard Play Store) ouvre directement l'application (`Shell.tsx`).

## Commandes du web (depuis `web/`)

- `npm run dev` — interface sur :3001 (`NEXT_PUBLIC_API_URL`, 3000 par défaut)
- `npm run build` puis `npm run typecheck` (arrêter `npm run dev` avant : les deux écrivent dans `.next`)
- PWA : `app/manifest.ts`, `public/sw.js` (actif en production seulement), icônes refaites par `npm run icons`.
  Écran de lancement : `components/Splash.tsx` (à chaque ouverture) et images iPhone/iPad (`public/splash`, liste dans
  `lib/apple-splash.json`, refaites par `npm run splash`). Sans compte, l'application s'ouvre sur `/connexion` (première
  ouverture, après déconnexion), sauf choix « Continuer sans compte » ; pages publiques : liste `PUBLIC` de `Shell.tsx`.
  Le service worker ne met **jamais** l'API en cache (stock et prix toujours en direct) ; il ne sert que la page
  `/hors-ligne` quand une navigation échoue.
- Essai local avec données de démonstration : démarrer l'API avec `EXPOSE_DEV_OTP=true` (le code SMS s'affiche à l'écran),
  puis `npm run seed:demo` côté backend (2 dépôts fictifs : connexion 07 01 00 01 01 / 07 01 00 01 02 ; admin : `ADMIN_PHONE`).

## Design « iGaz CI » (maquette validée par le propriétaire le 13/11/2026, remplace l'ancienne identité « acier peint »)

Fond lavande clair `#f4f3fa`, cartes blanches arrondies (18 px) avec ombre douce, violet nuit (`#140f33` → `#2a1d6b`) pour les
en-têtes vendeur/admin, l'écran de connexion et les cartes de chiffres. Orange pour les actions principales : dégradé
`#e05a12` → `#c2410c` (plus foncé que la maquette pour que le texte blanc reste lisible au soleil) ; `#c2410c` pour les prix
sur fond blanc ; `#f7931e` seulement en décor. Logo officiel : pictogramme « i » + bouteille à flamme (sources dans
`docs/logo/`, détouré par `npm run logo` dans `web/public/images/`) suivi de « Gaz CI » en texte (`components/Logo.tsx`) ;
icônes PWA refaites par `npm run icons`.
Police Plus Jakarta Sans. Barre d'onglets en bas selon le rôle (`components/Shell.tsx`), icônes au trait dans
`components/Icon.tsx`. Les jetons de couleur sont dans `app/globals.css` : ne pas écrire de couleur en dur dans les pages.
Bouteilles dessinées à la couleur de la marque, hauteur proportionnelle à la capacité (`components/Cylinder.tsx`).
Photos et logos de marques : seulement ceux fournis par iGaz (droits d'usage), déclarés dans `web/lib/media.ts` ; sans
fichier, l'interface affiche une illustration. Photos de bouteilles par marque et taille : originaux dans
`docs/photos/bouteilles/<marque>-<kg>.*`, détourés par `npm run bottles`, déclarés dans `BOTTLE_PHOTOS`. Le dépôt peut
envoyer la photo de chacun de ses produits (`PUT /stores/:id/products/:id/photo`, image brute réduite par le téléphone,
gardée en base dans `ProductPhoto`, règles dans `photo-rules.ts`) : elle passe avant `BOTTLE_PHOTOS`. Boutons d'au moins 44 px, pas d'animation d'entrée, français simple, verbes d'action.

## Commandes du backend (depuis `backend/`)

- `npm run start:dev` — API sur :3000 (PostgreSQL requis, voir `docker-compose.yml` et `.env.example`)
- `npm test` — tests unitaires des règles métier
- `npm run test:e2e` — parcours complet sur une vraie base (`TEST_DATABASE_URL`, base vidée à chaque lancement). En local :
  base `igaz_test` sur le PostgreSQL du docker-compose (`CREATE DATABASE igaz_test`, puis `prisma migrate deploy` avec
  `DATABASE_URL` pointant dessus), et `TEST_DATABASE_URL=postgresql://igaz:igaz@127.0.0.1:5432/igaz_test`. Jamais la base `igaz`.
- `npx prisma migrate dev --name <nom>` — toute modification de `prisma/schema.prisma` passe par une migration
- `npm run seed` — communes d'Abidjan, formats B6/B12/B24/B28 (B3 retiré, désactivé), compte admin (`ADMIN_PHONE`)

## Règles à ne jamais casser

- Montants en FCFA, **entiers**. Prix copiés dans `OrderItem` : un changement de prix n'affecte jamais une commande validée.
- Stock : décompté **à l'acceptation** par un décrément conditionnel atomique, jamais sous zéro ; tout mouvement est écrit
  dans `StockMovement` ; toute action admin dans `AuditLog`.
- Échange : bouteille vide de **même marque et même capacité** (`isExchangeCompatible`). Pas de compatibilité inter-marques au MVP.
- Un paiement mobile money n'est confirmé que par le webhook signé (jamais par le retour navigateur), de façon idempotente.
- Une commande n'est clôturée qu'avec le code de confirmation du client, jamais sur simple déclaration du fournisseur.
- Panier multi-dépôts (`Checkout`) : une commande par dépôt (jamais une commande à plusieurs dépôts), créées ensemble ou
  pas du tout, 3 dépôts au plus. En mobile money, un seul `Payment` rattaché au `Checkout` (un paiement vise une commande
  **ou** un panier, contrainte en base). Le dépôt ne voit jamais le panier (`present()` le retire).
- Cloisonnement : un fournisseur ne voit jamais les boutiques, commandes ou finances d'un autre (réponse 404, pas 403).
- Toute règle métier nouvelle ou modifiée s'accompagne d'un test (unitaire dans `order-rules.spec.ts` ou e2e dans `test/`).

## Démo en ligne (voir `docs/vercel.md`)

Démo privée sur Vercel : `igaz-web` (protégé sur toutes les adresses) et `igaz-api` + base Neon. Connexion par clé de
démo (`DEMO_ACCESS_KEY`) tant qu'il n'y a pas de prestataire SMS : ne jamais rendre le site public avec cette clé.

## Publication Play Store (voir `docs/android.md`)

- Fait (lot 1) : 13 communes du district, gestion des adresses, suppression de compte (`DELETE /auth/me`, anonymisation,
  page publique `/compte/supprimer`), pages `/conditions`, `/confidentialite`, `/aide`, route
  `/.well-known/assetlinks.json` (variables `ANDROID_PACKAGE_NAME`, `ANDROID_SHA256_FINGERPRINTS`), visuels de fiche
  (`npm run store-assets`).
- Bloquant, dépend du propriétaire : `web/lib/legal.ts` à compléter (société, contacts), relecture juridique des textes,
  hébergement HTTPS, prestataire SMS, agrégateur de paiement, accès des testeurs Google (connexion par SMS), compte Play.
- Fait aussi : notifications (dans l'application, push Web Push, SMS optionnel au dépôt ; textes dans
  `backend/src/notifications/messages.ts`, jamais de code de remise) et « Commander à nouveau ».
- Lots suivants convenus : 2 = avis et notes, statistiques vendeur, promotions ;
  3 = messagerie, espace livreur, abonnements, gestion admin des clients et remboursements.

## Reste à faire (ordre suggéré)

1. **Interface web** : fait pour le MVP (client, fournisseur, administration), PWA comprise (manifeste, icônes, page hors
   ligne). À faire : tests de bout en bout du navigateur dans la CI, tableau de bord de ventes pour le fournisseur,
   pagination des commandes (l'API renvoie les 100 dernières).
2. **Prestataire SMS** : implémenter `SmsProvider` (`backend/src/auth/sms.provider.ts`).
3. **Agrégateur de paiement** (Wave, Orange Money, MTN MoMo) : session de paiement dans `PaymentsService.initiate`,
   signature réelle dans `verifySignature`.
4. ~~Notifications~~ : fait (application, push, SMS optionnel). Reste : clés VAPID de production.
5. **Stockage des documents fournisseurs** (aujourd'hui : URL seulement).
6. **Limitation de débit**, CI GitHub Actions (tests unitaires + e2e avec PostgreSQL), remboursements manuels côté admin.
7. Application mobile Flutter sur la même API — seulement après le pilote.

## Avant de coder la suite

Les entretiens avec 5 à 10 dépôts d'Abidjan (prix réels, marges, livraison, volonté de mettre le stock à jour)
conditionnent le lancement : voir section « Validation terrain » du cahier MVP.
