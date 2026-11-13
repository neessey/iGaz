# iGaz — contexte pour Claude Code

Marketplace de gaz domestique en Côte d'Ivoire (Abidjan d'abord). Le propriétaire du projet parle français :
messages d'erreur, textes d'interface et documentation sont **en français**.

## Références

- Périmètre du MVP (source de vérité) : `docs/iGaz_MVP_Cahier_des_charges.pdf` (.docx)
- Vision complète à long terme : `docs/iGaz_Cahier_des_charges.pdf`
- Tout ce qui est « reporté » dans le cahier MVP (livreurs plateforme, commissions, abonnements, multi-fournisseurs,
  messagerie, avis, litiges) ne doit **pas** être développé sans accord explicite.

## Commandes (depuis `backend/`)

- `npm run start:dev` — API sur :3000 (PostgreSQL requis, voir `docker-compose.yml` et `.env.example`)
- `npm test` — tests unitaires des règles métier
- `npm run test:e2e` — parcours complet sur une vraie base (`TEST_DATABASE_URL`, base vidée à chaque lancement)
- `npx prisma migrate dev --name <nom>` — toute modification de `prisma/schema.prisma` passe par une migration
- `npm run seed` — communes d'Abidjan, formats B3/B6/B12, compte admin (`ADMIN_PHONE`)

## Règles à ne jamais casser

- Montants en FCFA, **entiers**. Prix copiés dans `OrderItem` : un changement de prix n'affecte jamais une commande validée.
- Stock : décompté **à l'acceptation** par un décrément conditionnel atomique, jamais sous zéro ; tout mouvement est écrit
  dans `StockMovement` ; toute action admin dans `AuditLog`.
- Échange : bouteille vide de **même marque et même capacité** (`isExchangeCompatible`). Pas de compatibilité inter-marques au MVP.
- Un paiement mobile money n'est confirmé que par le webhook signé (jamais par le retour navigateur), de façon idempotente.
- Une commande n'est clôturée qu'avec le code de confirmation du client, jamais sur simple déclaration du fournisseur.
- Cloisonnement : un fournisseur ne voit jamais les boutiques, commandes ou finances d'un autre (réponse 404, pas 403).
- Toute règle métier nouvelle ou modifiée s'accompagne d'un test (unitaire dans `order-rules.spec.ts` ou e2e dans `test/`).

## Reste à faire (ordre suggéré)

1. **Interface web** (Next.js + TypeScript, PWA responsive) : espace client (recherche par commune, fiche produit,
   commande achat/échange, livraison/retrait, suivi), espace fournisseur (boutique, mise à jour rapide du stock sur
   téléphone, file de commandes, saisie du code de confirmation), administration (validation des fournisseurs,
   catalogue, commandes, journal d'audit). Brancher sur l'API existante ; ajouter les routes manquantes au besoin
   (ex. lecture du journal d'audit, statistiques de base, tableau de bord fournisseur).
2. **Prestataire SMS** : implémenter `SmsProvider` (`backend/src/auth/sms.provider.ts`).
3. **Agrégateur de paiement** (Wave, Orange Money, MTN MoMo) : session de paiement dans `PaymentsService.initiate`,
   signature réelle dans `verifySignature`.
4. **Notifications** fournisseur (nouvelle commande) et client (changements de statut).
5. **Stockage des documents fournisseurs** (aujourd'hui : URL seulement).
6. **Limitation de débit**, CI GitHub Actions (tests unitaires + e2e avec PostgreSQL), remboursements manuels côté admin.
7. Application mobile Flutter sur la même API — seulement après le pilote.

## Avant de coder la suite

Les entretiens avec 5 à 10 dépôts d'Abidjan (prix réels, marges, livraison, volonté de mettre le stock à jour)
conditionnent le lancement : voir section « Validation terrain » du cahier MVP.
