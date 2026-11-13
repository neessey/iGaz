import type { Metadata } from 'next';
import Link from 'next/link';
import { Fill } from '@/components/Todo';
import { PageHead } from '@/components/ui';
import { COMPANY, LEGAL_UPDATED } from '@/lib/legal';

export const metadata: Metadata = { title: 'Politique de confidentialité · iGaz CI' };

/** Modèle de politique de confidentialité, aligné sur le fonctionnement réel de l'application. À faire relire par un juriste. */
export default function Privacy() {
  return (
    <div className="stack-lg">
      <PageHead title="Confidentialité" />
      <article className="card prose stack-sm">
        <p className="small muted">Dernière mise à jour : {LEGAL_UPDATED}</p>
        <p>
          Cette politique explique quelles données <strong>{COMPANY.brand}</strong> collecte, pourquoi, et comment vous gardez la main
          dessus. Responsable du traitement : <Fill value={COMPANY.legalName} label="raison sociale" />, <Fill value={COMPANY.address} label="adresse du siège" />,
          RCCM <Fill value={COMPANY.rccm} label="numéro RCCM" />.
        </p>

        <h2>Les données que nous utilisons</h2>
        <ul>
          <li><strong>Numéro de téléphone</strong> : pour créer votre compte et vous envoyer le code de connexion par SMS. Pas de mot de passe.</li>
          <li><strong>Nom</strong> (facultatif) : pour que le dépôt sache qui il livre.</li>
          <li><strong>Adresses de livraison</strong> : commune, quartier et repères que vous saisissez.</li>
          <li><strong>Commandes</strong> : bouteilles, prix, mode de réception, statuts, dates.</li>
          <li><strong>Paiements</strong> : montant, statut et référence de l’opérateur. Nous ne voyons jamais votre code secret mobile money.</li>
          <li><strong>Pour les vendeurs</strong> : nom du dépôt, adresse, horaires, documents d’autorisation fournis.</li>
        </ul>
        <p>Nous ne collectons ni vos contacts, ni vos photos, ni votre position GPS.</p>

        <h2>Pourquoi</h2>
        <ul>
          <li>vous connecter de façon sûre ;</li>
          <li>transmettre votre commande au dépôt choisi et la suivre jusqu’à la remise ;</li>
          <li>confirmer les paiements et traiter les remboursements ;</li>
          <li>prévenir la fraude et garder une trace des actions de l’équipe iGaz (journal d’audit).</li>
        </ul>
        <p>Pas de publicité ciblée, pas de revente de données.</p>

        <h2>Qui voit quoi</h2>
        <ul>
          <li><strong>Le dépôt</strong> qui reçoit votre commande voit votre nom, votre numéro et l’adresse de livraison de cette commande, rien d’autre.
            Il ne voit pas vos commandes chez les autres dépôts.</li>
          <li><strong>Le prestataire SMS</strong> reçoit votre numéro pour envoyer le code.</li>
          <li><strong>L’opérateur de paiement</strong> (Wave, Orange Money, MTN MoMo…) traite le paiement selon ses propres conditions.</li>
          <li><strong>Notre hébergeur</strong> stocke les données pour notre compte.</li>
        </ul>

        <h2>Combien de temps</h2>
        <p>
          Vos données de compte sont gardées tant que votre compte existe. À la suppression du compte, votre numéro, votre nom et vos
          adresses sont effacés ; le détail des commandes est conservé sans identité pour la comptabilité et nos obligations légales.
          Les codes SMS expirent au bout de quelques minutes.
        </p>

        <h2>Sur votre téléphone</h2>
        <p>L’application garde sur votre téléphone votre session, votre panier et votre dernière commune choisie. Aucun traceur publicitaire.</p>

        <h2>Vos droits</h2>
        <p>
          Conformément à la loi ivoirienne n° 2013-450 relative à la protection des données à caractère personnel, vous pouvez accéder à
          vos données, les corriger ou les supprimer. Supprimez votre compte à tout moment : Profil, puis
          « <Link href="/compte/supprimer">Supprimer mon compte</Link> ». Pour toute autre demande :{' '}
          <Fill value={COMPANY.dataContact ?? COMPANY.email} label="e-mail de contact" />. Vous pouvez aussi saisir l’ARTCI.
        </p>

        <h2>Sécurité</h2>
        <p>Connexions chiffrées (HTTPS), codes SMS stockés sous forme chiffrée et à usage unique, paiements confirmés uniquement par l’opérateur.</p>
      </article>
    </div>
  );
}
