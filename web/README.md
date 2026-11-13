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
| Client | `/` recherche (taille, mode, commune, marque) · `/produit/[id]` commande achat ou échange, livraison ou retrait, paiement · `/commandes` et `/commandes/[id]` suivi, code de remise, annulation |
| Fournisseur | `/fournisseur` commandes (accepter, refuser, livrer, saisir le code) · `/fournisseur/stock` mise à jour rapide du stock et des prix · `/fournisseur/boutique` · `/fournisseur/inscription` |
| Administration | `/admin` chiffres et validation des fournisseurs · `/admin/catalogue` · `/admin/commandes` · `/admin/audit` |

## Notes

- La session est un jeton JWT gardé dans `localStorage` ; l'API relit le rôle à chaque requête.
- Le paiement mobile money affiche « pas encore branché » tant que l'agrégateur n'est pas intégré côté API (`checkoutUrl` vide).
- Les polices sont embarquées (`@fontsource`), aucune requête vers un service externe.
