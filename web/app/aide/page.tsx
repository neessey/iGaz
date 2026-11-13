import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { Fill } from '@/components/Todo';
import { PageHead } from '@/components/ui';
import { COMPANY } from '@/lib/legal';

export const metadata: Metadata = { title: 'Aide et contact · iGaz CI' };

const FAQ: [string, string][] = [
  ['Comment commander ?', 'Choisissez votre commune en haut de l’accueil, ouvrez un dépôt, touchez « + » sur la bouteille voulue, puis « Voir le panier » et « Passer la commande ».'],
  ['Échange ou achat simple, quelle différence ?', 'En échange, vous remettez une bouteille vide de même marque et de même taille : vous ne payez que le gaz. En achat simple, vous payez aussi la bouteille.'],
  ['Puis-je commander chez plusieurs dépôts ?', 'Oui, jusqu’à 3 dépôts dans le même panier. Vous recevez une commande par dépôt, chacune avec son code de remise, et vous payez en une fois.'],
  ['À quoi sert le code de remise ?', 'Il prouve que vous avez bien reçu la bouteille. Donnez-le au livreur ou au dépôt seulement quand vous l’avez en main.'],
  ['Comment payer ?', 'Par mobile money avant la préparation, ou à la remise de la bouteille. En mobile money, la commande part au dépôt dès que l’opérateur confirme le paiement.'],
  ['Comment annuler ?', 'Dans « Mes commandes », ouvrez la commande et touchez « Annuler » tant que le dépôt ne l’a pas acceptée. Après, appelez le dépôt.'],
  ['Quelles communes sont livrées ?', 'Les 13 communes du District d’Abidjan, selon les dépôts : chaque dépôt indique les communes qu’il livre. Vous pouvez aussi retirer au dépôt.'],
  ['Je vends du gaz, comment rejoindre iGaz ?', 'Touchez « Vous vendez du gaz ? » en bas de l’accueil. L’équipe iGaz vérifie votre dépôt avant de l’afficher.'],
];

export default function Help() {
  const wa = COMPANY.whatsapp;
  return (
    <div className="stack-lg">
      <PageHead title="Aide et contact" />

      <section className="panel panel-stop stack-sm" aria-label="Urgence gaz">
        <strong className="cluster" style={{ gap: 8 }}><Icon name="alert" size={20} />Odeur de gaz ou incendie ?</strong>
        <p>Fermez le robinet de la bouteille, aérez, n’allumez rien. Appelez les sapeurs-pompiers (GSPM) au 180.</p>
        <a className="btn btn-danger" href="tel:180"><Icon name="phone" size={18} />Appeler le 180</a>
      </section>

      <section className="card faq" aria-labelledby="faq">
        <h2 id="faq" style={{ marginBottom: 6 }}>Questions fréquentes</h2>
        {FAQ.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </section>

      <section className="card stack-sm" aria-labelledby="contact">
        <h2 id="contact">Nous contacter</h2>
        <p className="small muted">Une question sur une commande ? Le plus rapide est d’appeler le dépôt depuis la commande.</p>
        {wa && <a className="btn btn-block" href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer">Écrire sur WhatsApp</a>}
        {COMPANY.phone && <a className="btn btn-quiet btn-block" href={`tel:${COMPANY.phone}`}><Icon name="phone" size={18} />Appeler le support</a>}
        <p className="small">E-mail : {COMPANY.email ? <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> : <Fill value={null} label="e-mail du support" />}</p>
        {!wa && !COMPANY.phone && <p className="small"><Fill value={null} label="téléphone ou WhatsApp du support" /></p>}
      </section>

      <nav className="card rows-flat" aria-label="Informations légales" style={{ paddingTop: 4, paddingBottom: 4 }}>
        {[['/conditions', 'Conditions d’utilisation'], ['/confidentialite', 'Politique de confidentialité'], ['/compte/supprimer', 'Supprimer mon compte']].map(([href, label]) => (
          <Link key={href} href={href} className="split" style={{ color: 'inherit', textDecoration: 'none', flexWrap: 'nowrap', minHeight: 48 }}>
            {label}<Icon name="chevron" size={18} />
          </Link>
        ))}
      </nav>
    </div>
  );
}
