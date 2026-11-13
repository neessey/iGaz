import type { Metadata } from 'next';
import Link from 'next/link';
import { Fill } from '@/components/Todo';
import { PageHead } from '@/components/ui';
import { COMPANY, LEGAL_UPDATED } from '@/lib/legal';

export const metadata: Metadata = { title: 'Conditions d’utilisation · iGaz CI' };

/** Modèle de conditions générales d'utilisation, aligné sur les règles de l'application. À faire relire par un juriste. */
export default function Terms() {
  return (
    <div className="stack-lg">
      <PageHead title="Conditions d’utilisation" />
      <article className="card prose stack-sm">
        <p className="small muted">Dernière mise à jour : {LEGAL_UPDATED}</p>
        <p>
          {COMPANY.brand} est édité par <Fill value={COMPANY.legalName} label="raison sociale" />, <Fill value={COMPANY.address} label="adresse du siège" />,
          RCCM <Fill value={COMPANY.rccm} label="numéro RCCM" />. En créant un compte, vous acceptez ces conditions.
        </p>

        <h2>1. Le service</h2>
        <p>
          iGaz met en relation des clients et des dépôts de gaz domestique à Abidjan. <strong>Le dépôt vend et remet la bouteille</strong> ;
          iGaz transmet la commande, le paiement et le suivi. iGaz vérifie les dépôts avant de les afficher, mais cette vérification ne
          remplace pas les autorisations légales que chaque dépôt doit détenir.
        </p>

        <h2>2. Votre compte</h2>
        <p>Le compte est lié à votre numéro de téléphone ivoirien, confirmé par un code SMS. Ne communiquez jamais ce code à personne.</p>

        <h2>3. Commandes et prix</h2>
        <ul>
          <li>Les prix sont en francs CFA et fixés par chaque dépôt. Le prix affiché au moment de la commande est celui que vous payez.</li>
          <li>Un panier peut regrouper jusqu’à 3 dépôts : vous recevez une commande par dépôt, chacune avec ses frais de livraison.</li>
          <li>Le dépôt peut refuser une commande (rupture, zone non desservie). Vous êtes alors prévenu et remboursé si vous aviez payé.</li>
        </ul>

        <h2>4. Échange de bouteille</h2>
        <p>L’échange suppose de remettre une bouteille vide <strong>de même marque et de même taille</strong>, en bon état. Sinon le dépôt peut refuser l’échange.</p>

        <h2>5. Paiement</h2>
        <ul>
          <li>Mobile money : la commande n’est envoyée au dépôt qu’après la confirmation de l’opérateur.</li>
          <li>À la remise : vous payez le dépôt ou le livreur en recevant la bouteille.</li>
        </ul>

        <h2>6. Remise et code de confirmation</h2>
        <p>
          Chaque commande a un code de remise à 6 chiffres. Donnez-le <strong>seulement quand vous avez la bouteille en main</strong> :
          il confirme la remise et clôt la commande.
        </p>

        <h2>7. Annulation et remboursement</h2>
        <p>Vous pouvez annuler tant que le dépôt n’a pas accepté la commande. Ensuite, contactez le dépôt ou le support. Un paiement en ligne d’une commande annulée ou refusée est remboursé.</p>

        <h2>8. Sécurité</h2>
        <p>Vérifiez l’état de la bouteille et du joint à la remise. Refusez une bouteille abîmée ou qui sent le gaz. En cas de fuite ou d’incendie, appelez les sapeurs-pompiers (GSPM) au <strong>180</strong>.</p>

        <h2>9. Vendeurs</h2>
        <p>Les dépôts s’engagent à tenir leur stock et leurs prix à jour, à respecter la réglementation sur le gaz et à ne clôturer une commande qu’avec le code du client.</p>

        <h2>10. Suppression du compte</h2>
        <p>Vous pouvez supprimer votre compte à tout moment : <Link href="/compte/supprimer">Supprimer mon compte</Link>.</p>

        <h2>11. Droit applicable</h2>
        <p>Ces conditions sont régies par le droit ivoirien. Contact : <Fill value={COMPANY.email} label="e-mail de contact" />.</p>
      </article>
    </div>
  );
}
