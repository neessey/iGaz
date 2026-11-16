# Démo en ligne sur Vercel

Démo **privée** d'iGaz, en attendant le prestataire SMS et l'agrégateur de paiement.

| Projet Vercel | Dossier | Adresse | Protection |
| --- | --- | --- | --- |
| `igaz-web` | `web/` | https://igaz-web.vercel.app | Connexion Vercel obligatoire sur **toutes** les adresses (`ssoProtection: all`) |
| `igaz-api` | `backend/` | https://igaz-api-devyans-projects-805b7991.vercel.app | Aucune : les appels du site doivent passer ; voir « Clé de démo » |
| `igaz-ci` | `web/` (mode vitrine) | https://igaz-ci.vercel.app | **Public** : présentation et pages légales seulement (`NEXT_PUBLIC_SITE_MODE=vitrine`), jamais de clé de démo ; adresse donnée à Paystack |

Les deux projets sont reliés à `github.com/neessey/iGaz`. Le déploiement de production est créé depuis la branche de
travail (`refonte-pwa-panier`) ; un envoi sur GitHub crée des prévisualisations.

## Base de données

Neon (offre gratuite), reliée à `igaz-api` depuis la place de marché Vercel : elle fournit `DATABASE_URL` (pooler) et
`DATABASE_URL_UNPOOLED` (connexion directe). `npm run vercel-build` (`backend/scripts/vercel-build.mjs`) applique les
migrations par la connexion directe, puis les données de base (`ADMIN_PHONE`) et de démo (`SEED_DEMO=true`).

Prisma utilise le moteur « library » avec la cible `rhel-openssl-3.0.x` : le mode `engineType = "client"` charge un
fichier WebAssembly que Vercel n'embarque pas dans une fonction NestJS (erreur 500 / ENOENT).

## Clé de démo

Sans prestataire SMS, la connexion n'est possible qu'en affichant le code. L'API ne le révèle qu'aux requêtes portant
`DEMO_ACCESS_KEY` (en-tête `x-igaz-demo`), clé intégrée au site par `NEXT_PUBLIC_DEMO_ACCESS_KEY`. Le site étant protégé,
la clé n'est lisible que par les personnes autorisées sur Vercel.

- **Ne jamais** rendre `igaz-web` public tant que `NEXT_PUBLIC_DEMO_ACCESS_KEY` est définie : n'importe qui pourrait se
  connecter avec n'importe quel numéro, y compris celui de l'admin.
- Attention : la protection « standard » de Vercel laisse l'adresse `igaz-web.vercel.app` **publique** ; il faut le réglage
  « toutes les adresses ».
- Changer la clé : nouvelle valeur (24 caractères au moins) dans `DEMO_ACCESS_KEY` (API) **et**
  `NEXT_PUBLIC_DEMO_ACCESS_KEY` (site), puis redéployer les deux.

## Variables de l'API (`igaz-api`)

`JWT_SECRET`, `PAYMENT_WEBHOOK_SECRET`, `DEMO_ACCESS_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
(clés propres à la démo, différentes de celles de développement), `ADMIN_PHONE`, `SEED_DEMO`, `JWT_EXPIRES_IN`,
`COD_MAX_AMOUNT`, `NOTIFY_SUPPLIER_BY_SMS`, `CORS_ORIGIN` (adresses du site), et celles de Neon.

## Paiement par Paystack

**Au lancement, le mobile money est masqué** : sans `MOBILE_MONEY_ENABLED=true` sur `igaz-api`, l'appli ne propose que le
paiement à la remise et l'API refuse une commande en mobile money. Le mettre à `true` quand Paystack est activé au nom
d'Alees (et revoir alors la question « Comment payer ? » de `web/app/aide/page.tsx` et la présentation).

Avec `PAYSTACK_SECRET_KEY` sur `igaz-api`, le paiement mobile money ouvre la page de paiement Paystack (Wave,
Orange Money, MTN, carte) puis revient sur la commande. Commencer par la **clé de test** (`sk_test_…`) : aucun argent
réel. Dans le tableau de bord Paystack (Settings → API Keys & Webhooks), déclarer l'adresse de notification
`https://igaz-api.vercel.app/payments/paystack/webhook`. Chaque notification est vérifiée (signature HMAC-SHA512) puis
revérifiée auprès de Paystack avant de confirmer une commande. Facultatif : `PAYSTACK_WEBHOOK_SECRET` (clé de signature
des webhooks, si Paystack en fournit une), `APP_URL` (adresse du site pour le retour).

## SMS par Celcom Africa (prestataire retenu)

`SMS_PROVIDER=celcom` sur `igaz-api` envoie les codes de connexion (et, si `NOTIFY_SUPPLIER_BY_SMS=true`, les alertes
aux dépôts) par Celcom Africa, vers Orange, MTN et Moov. Sur celcomafrica.com : créer le compte, recharger le crédit
(mobile money, carte ou virement), faire approuver le nom d'expéditeur (ex. « iGaz CI »), puis copier la clé et
l'identifiant partenaire (« Get API key & Partner ID ») dans `CELCOM_API_KEY` et `CELCOM_PARTNER_ID`, et le nom
approuvé dans `CELCOM_SENDER` (réglages du projet sur Vercel, jamais dans le code ni dans une conversation). Crédit
épuisé, expéditeur refusé… : la connexion affiche « Envoi du SMS impossible » et la cause (code Celcom) apparaît dans
les journaux de l'API.

## SMS par Orange (en réserve)

`SMS_PROVIDER=orange` sur `igaz-api` envoie les codes de connexion (et, si `NOTIFY_SUPPLIER_BY_SMS=true`, les alertes
aux dépôts) par l'API SMS d'Orange Developer. À faire sur developer.orange.com : créer l'application, s'abonner à
« SMS Côte d'Ivoire », acheter un forfait (bouton « Configure »), puis copier le **Client ID** et le **Client secret**
dans les variables `ORANGE_SMS_CLIENT_ID` et `ORANGE_SMS_CLIENT_SECRET` (réglages du projet sur Vercel, jamais dans le
code ni dans une conversation). Facultatif : `ORANGE_SMS_SENDER_NAME` (ex. « iGaz CI »), seulement une fois approuvé par
Orange, sinon les envois sont refusés. Sans forfait ou forfait épuisé : la connexion échoue avec « Envoi du SMS
impossible » et la cause apparaît dans les journaux de l'API. Avec la clé de démo, le code reste aussi affiché à l'écran.

## Passer en production publique

1. Brancher le prestataire SMS et l'agrégateur de paiement ; compléter `web/lib/legal.ts`.
2. Supprimer `DEMO_ACCESS_KEY`, `NEXT_PUBLIC_DEMO_ACCESS_KEY` et `SEED_DEMO`, puis créer une **nouvelle** base (sans les
   dépôts fictifs) et de nouveaux secrets.
3. Seulement ensuite, lever la protection du site et y ajouter le nom de domaine.
