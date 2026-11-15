import type { Metadata } from 'next';
import Link from 'next/link';
import { Fill } from '@/components/Todo';
import { PageHead } from '@/components/ui';
import { COMPANY, LEGAL_UPDATED } from '@/lib/legal';

export const metadata: Metadata = { title: 'Annulation et remboursement · iGaz CI' };

/**
 * Politique d'annulation et de remboursement (demandée par les agrégateurs de paiement), alignée sur les règles de
 * l'application : annulation libre avant l'acceptation du dépôt, remboursement des paiements en ligne d'une commande
 * refusée ou annulée, frais de service jamais facturés pour une commande non remise. Relecture juridique conseillée.
 */
export default function Refunds() {
  return (
    <div className="stack-lg">
      <PageHead title="Annulation et remboursement" />
      <article className="card prose stack-sm">
        <p className="small muted">Dernière mise à jour : {LEGAL_UPDATED}</p>
        <p>
          Cette politique s’applique aux commandes passées sur {COMPANY.brand}, service de <Fill value={COMPANY.legalName} label="raison sociale" />,
          RCCM <Fill value={COMPANY.rccm} label="numéro RCCM" />.
        </p>

        <h2>1. Annuler une commande</h2>
        <ul>
          <li>Vous pouvez annuler <strong>gratuitement</strong> tant que le dépôt n’a pas accepté la commande : dans « Mes commandes », ouvrez-la et touchez « Annuler ».</li>
          <li>Une fois la commande acceptée, le dépôt prépare votre bouteille : contactez-le, ou contactez notre support, pour toute annulation.</li>
        </ul>

        <h2>2. Commande refusée ou annulée</h2>
        <ul>
          <li>Si le dépôt refuse votre commande (rupture de stock, zone non desservie) ou si elle est annulée, vous êtes prévenu dans l’application.</li>
          <li><strong>Paiement à la remise</strong> : vous n’avez rien payé, il n’y a rien à rembourser.</li>
          <li><strong>Paiement par mobile money</strong> : le montant payé vous est remboursé <strong>en totalité</strong>, frais de service compris, sur le compte mobile money utilisé pour payer.</li>
        </ul>

        <h2>3. Délai de remboursement</h2>
        <p>
          Le remboursement est lancé au plus tard <strong>7 jours ouvrés</strong> après le refus ou l’annulation. Le délai de réception dépend
          ensuite de votre opérateur de mobile money.
        </p>

        <h2>4. Problème à la remise</h2>
        <ul>
          <li>Vérifiez la bouteille avant de donner votre code de remise. Refusez une bouteille abîmée, qui fuit ou qui ne correspond pas à votre commande (marque, taille).</li>
          <li>Tant que vous n’avez pas donné votre code, la commande n’est pas terminée : contactez le support, nous trouvons une solution avec le dépôt (remplacement ou remboursement).</li>
          <li>Pour un échange, la bouteille vide remise doit être de même marque et de même taille, en bon état ; sinon, le dépôt peut refuser l’échange.</li>
        </ul>

        <h2>5. Frais de service</h2>
        <p>Les frais de service d’{COMPANY.brand} ne sont dus que pour une commande remise. Une commande refusée ou annulée ne vous est pas facturée.</p>

        <h2>6. Nous contacter</h2>
        <p>
          Pour toute demande d’annulation ou de remboursement : <Fill value={COMPANY.email} label="e-mail de contact" />
          {COMPANY.phone ? <>, ou par téléphone et WhatsApp au {COMPANY.phone}</> : null}. Indiquez le numéro de votre commande (#GZ-…).
          Voir aussi nos <Link href="/conditions">conditions d’utilisation</Link>.
        </p>
      </article>
    </div>
  );
}
