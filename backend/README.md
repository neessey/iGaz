# iGaz — backend (MVP)

API de la marketplace de gaz domestique en Côte d'Ivoire. NestJS + Prisma + PostgreSQL.
Périmètre : voir `../docs/iGaz_MVP_Cahier_des_charges.pdf`.

## Démarrage

```bash
docker compose up -d db              # PostgreSQL 16 (depuis la racine du dépôt)
cd backend
cp .env.example .env                 # puis renseigner JWT_SECRET, PAYMENT_WEBHOOK_SECRET, ADMIN_PHONE
npm install
npx prisma migrate deploy            # applique prisma/migrations
npm run seed                         # communes d'Abidjan, formats B3/B6/B12, compte admin
npm run seed:demo                    # (facultatif, local) 2 dépôts et 2 marques fictifs pour essayer l'interface
npm run start:dev                    # http://localhost:3000
```

En développement, le code OTP est affiché dans les logs du serveur (aucun SMS n'est envoyé). Avec `EXPOSE_DEV_OTP=true`,
l'API le renvoie aussi dans sa réponse (`devCode`) pour les démonstrations locales ; ignoré en production.
`CORS_ORIGIN` liste les origines autorisées pour l'interface web (obligatoire en production).
En production, l'envoi échoue tant qu'aucun prestataire SMS n'est branché (`src/auth/sms.provider.ts`).

## Tests

```bash
npm test                                                   # tests unitaires des règles métier
TEST_DATABASE_URL=postgresql://igaz:igaz@127.0.0.1:5432/igaz_test npm run test:e2e
```

Les tests e2e rejouent le parcours complet sur une vraie base PostgreSQL : appliquer d'abord la migration sur `igaz_test`
(`DATABASE_URL=... npx prisma migrate deploy`). La base est vidée au début de la suite : n'utilisez jamais une base qui contient des données.

## Ce qui est implémenté

| Domaine | Contenu |
| --- | --- |
| Authentification | Téléphone ivoirien + OTP à 6 chiffres (haché, expire, 5 essais, usage unique, 3 demandes / 10 min), JWT |
| Rôles | `CLIENT`, `SUPPLIER`, `ADMIN` ; rôle relu en base à chaque requête |
| Catalogue central | Marques, formats (B3, B6…), communes : lecture publique, écriture admin avec journal d'audit |
| Fournisseurs | Inscription → validation admin ; boutiques, horaires, zones desservies, frais de livraison |
| Produits et stock | Prix d'achat / d'échange par boutique, stock avec journal des mouvements, correction admin justifiée |
| Recherche publique | Uniquement les offres commandables : stock > 0, fournisseur validé, boutique ouverte, mode et zone desservis |
| Commandes | Achat ou échange, livraison ou retrait, prix figés, un fournisseur par commande |
| Cycle de vie | `PENDING_PAYMENT → SUBMITTED → ACCEPTED → READY_FOR_PICKUP / OUT_FOR_DELIVERY → COMPLETED` (+ refus, annulations) |
| Paiement | Mobile money par webhook signé (HMAC), idempotent ; paiement à la livraison plafonné |

## Règles métier couvertes par les tests

Stock insuffisant bloquant · stock décompté à l'acceptation, de façon atomique (pas de stock négatif même en cas de
commandes simultanées) · stock restitué en cas d'annulation admin · échange refusé si marque ou capacité différente ·
clôture uniquement avec le code de confirmation du client · paiement jamais confirmé sans webhook signé · double clic de
paiement = une seule transaction · changement de prix sans effet sur les commandes validées · un fournisseur n'accède
jamais aux commandes ni aux boutiques d'un autre · toute action admin laisse une trace dans `AuditLog`.

## À brancher ou à décider avant la mise en production

- **Prestataire SMS** (OTP) : implémenter `SmsProvider`.
- **Agrégateur de paiement** : `PaymentsService.initiate` doit créer la session de paiement (`checkoutUrl`), et
  `verifySignature` doit suivre le schéma de signature réel du prestataire (le HMAC actuel est un schéma générique).
- **Remboursements** : aucun remboursement automatique. Les commandes annulées après paiement sont signalées dans
  `OrderEvent` pour traitement manuel par l'administration.
- **Limitation de débit** (anti brute-force du code de confirmation, des OTP par IP) : à ajouter au niveau API / passerelle.
- **Plafond du paiement à la livraison** (`COD_MAX_AMOUNT`, 100 000 FCFA par défaut) : valeur provisoire.
- **Documents fournisseurs** : seules les URL sont enregistrées ; le stockage de fichiers reste à faire.
- **Notifications** (SMS / push) aux fournisseurs et aux clients : non implémentées.
- **Réglementation** (autorisations de distribution, transport, ARTCI) : à valider avec les autorités compétentes.

## Notes techniques

- Prisma est utilisé avec `engineType = "client"` et l'adaptateur `@prisma/adapter-pg` (pas de moteur Rust).
- Montants en FCFA, entiers. Abidjan est en UTC+0 : les horaires de boutique sont comparés en UTC.
- `prisma/migrations/0001_init` a été écrite à la main et validée par les tests sur PostgreSQL 16. Si
  `npx prisma migrate dev` signale un écart avec `schema.prisma`, régénérer la migration à partir du schéma.
