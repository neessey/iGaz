# Démo en ligne sur Vercel

Démo **privée** d'iGaz, en attendant le prestataire SMS et l'agrégateur de paiement.

| Projet Vercel | Dossier | Adresse | Protection |
| --- | --- | --- | --- |
| `igaz-web` | `web/` | https://igaz-web.vercel.app | Connexion Vercel obligatoire sur **toutes** les adresses (`ssoProtection: all`) |
| `igaz-api` | `backend/` | https://igaz-api-devyans-projects-805b7991.vercel.app | Aucune : les appels du site doivent passer ; voir « Clé de démo » |

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

## Passer en production publique

1. Brancher le prestataire SMS et l'agrégateur de paiement ; compléter `web/lib/legal.ts`.
2. Supprimer `DEMO_ACCESS_KEY`, `NEXT_PUBLIC_DEMO_ACCESS_KEY` et `SEED_DEMO`, puis créer une **nouvelle** base (sans les
   dépôts fictifs) et de nouveaux secrets.
3. Seulement ensuite, lever la protection du site et y ajouter le nom de domaine.
