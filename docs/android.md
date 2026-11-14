# Publier iGaz CI sur le Play Store

L'application Android est la PWA (`web/`) emballée en **Trusted Web Activity** (TWA) : le site s'ouvre en plein écran,
sans barre d'adresse, avec l'icône iGaz. Une mise à jour du site met donc à jour l'application, sans republier.

## 1. Avant tout : ce qui doit exister

- [ ] **Site en ligne en HTTPS** sur un nom de domaine (ex. `app.igaz.ci`), avec l'API (ex. `api.igaz.ci`) et la base PostgreSQL.
  Variables du web : `NEXT_PUBLIC_API_URL`. Variables de l'API : voir `backend/.env.example` (`CORS_ORIGIN` = adresse du site).
- [x] **Prestataire SMS** : Orange Developer, branché (`backend/src/auth/orange-sms.provider.ts`, `SMS_PROVIDER=orange`).
  Reste : identifiants et forfait SMS sur le portail Orange, nom d'expéditeur approuvé (voir `docs/vercel.md`).
- [ ] **Clés de notifications push** : générer une paire de production (`npx web-push generate-vapid-keys`) et la mettre
  dans `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` de l'API (ne jamais réutiliser les clés de développement).
  Décider si les dépôts reçoivent aussi un SMS par nouvelle commande (`NOTIFY_SUPPLIER_BY_SMS`, payant).
- [ ] **Agrégateur de paiement** branché, ou le mobile money masqué au lancement (paiement à la remise seulement).
- [ ] **`web/lib/legal.ts` complété** : raison sociale, RCCM, adresse, e-mail, téléphone ou WhatsApp du support.
  Les pages `/conditions` et `/confidentialite` relues par un juriste.
- [ ] **Compte développeur Google Play** (frais uniques de 25 $).
- [ ] **Accès des testeurs de Google** : ils doivent pouvoir se connecter. La connexion se fait par SMS : il faut prévoir
  un numéro de test (ex. un numéro dédié dont l'équipe lit les SMS, ou un mécanisme de code fixe réservé à ce seul
  numéro, à décider et à sécuriser). À renseigner dans « Accès à l'application » de la Play Console.

## 2. Générer le paquet Android (`.aab`)

Prérequis : Node.js. Bubblewrap télécharge lui-même le JDK et le SDK Android au premier lancement (plusieurs centaines de Mo).

```bash
npx @bubblewrap/cli init --manifest https://app.igaz.ci/manifest.webmanifest
```

Réponses conseillées :

| Question | Réponse |
| --- | --- |
| Application ID | `ci.igaz.app` (définitif après publication) |
| Nom / nom court | `iGaz CI` |
| Couleurs | thème `#f4f3fa`, fond `#140f33` (reprises du manifeste) |
| Icônes | celles du manifeste (`/icons/icon-512.png`, `/icons/icon-maskable-512.png`) |
| Clé de signature | créer une nouvelle clé, **la sauvegarder hors de l'ordinateur** avec son mot de passe : sans elle, plus de mise à jour possible |

```bash
npx @bubblewrap/cli build
```

Le fichier `app-release-bundle.aab` est celui à envoyer sur la Play Console.

## 3. Lier le site à l'application (Digital Asset Links)

Sans cette étape, l'application affiche une barre d'adresse comme un navigateur.

1. Empreinte de votre clé : `keytool -list -v -keystore android.keystore` (ligne `SHA256`).
2. Après le premier envoi sur la Play Console : *Configuration → Intégrité de l'application → Signature d'application*,
   copier l'empreinte SHA-256 de la **clé de signature de l'application** (Google re-signe le paquet).
3. Sur le serveur web, définir :
   ```
   ANDROID_PACKAGE_NAME=ci.igaz.app
   ANDROID_SHA256_FINGERPRINTS=AA:BB:…(votre clé),CC:DD:…(clé Google Play)
   ```
4. Vérifier : `https://app.igaz.ci/.well-known/assetlinks.json` doit renvoyer les deux empreintes
   (route `web/app/.well-known/assetlinks.json/route.ts`).

## 4. Fiche Play Store

Visuels prêts dans `docs/play-store/` (refaits par `npm run store-assets` depuis `web/`) :

- `icon-512.png` : icône haute définition ;
- `feature-graphic.png` : bannière 1024 × 500.

À fournir en plus : **au moins 2 captures d'écran de téléphone** (format 9:16, ex. 1080 × 1920) : accueil, page dépôt,
panier, suivi de commande.

Textes proposés :

- **Titre** : iGaz CI : gaz livré à Abidjan
- **Description courte** : Commandez votre bouteille de gaz près de chez vous : livraison ou retrait, échange ou achat.
- **Catégorie** : Shopping (ou Maison).

Liens à renseigner :

| Champ de la Play Console | Adresse |
| --- | --- |
| Politique de confidentialité | `https://app.igaz.ci/confidentialite` |
| Suppression du compte (Sécurité des données) | `https://app.igaz.ci/compte/supprimer` |
| Site web / assistance | `https://app.igaz.ci/aide` |

## 5. Formulaire « Sécurité des données » (réponses à vérifier)

| Donnée | Collectée | Partagée | Pourquoi |
| --- | --- | --- | --- |
| Numéro de téléphone | Oui | Oui : prestataire SMS ; le dépôt de la commande | Compte, connexion, livraison |
| Nom | Oui (facultatif) | Oui : le dépôt de la commande | Livraison |
| Adresse (saisie, pas de GPS) | Oui | Oui : le dépôt de la commande | Livraison |
| Historique d'achats | Oui | Non | Fonctionnement, comptabilité |
| Informations de paiement | Non (traitées par l'opérateur) | — | — |
| Position, contacts, photos | Non | — | — |

- Données chiffrées en transit : **oui** (HTTPS).
- L'utilisateur peut demander la suppression : **oui**, dans l'application (Profil → Supprimer mon compte) et sur le web.

## 6. Autres rubriques de la Play Console

- **Classification du contenu** : questionnaire IARC (pas de violence, pas de contenu sensible) ; préciser la vente de gaz
  domestique si demandé.
- **Public cible** : 18 ans et plus (achat et manipulation de gaz).
- **Annonces** : l'application ne contient pas de publicité.
- **Publication** : commencer par un **test interne**, puis un test fermé (Google demande souvent 12 testeurs pendant
  14 jours pour un nouveau compte personnel), puis la production.
