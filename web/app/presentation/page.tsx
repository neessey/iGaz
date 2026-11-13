import type { Metadata } from 'next';
import Link from 'next/link';
import { InstallApp } from '@/components/InstallApp';
import { Icon, IconName } from '@/components/Icon';
import { Logo } from '@/components/Logo';

export const metadata: Metadata = {
  title: 'iGaz CI : votre gaz livré à Abidjan',
  description: 'Trouvez une bouteille de gaz disponible près de chez vous à Abidjan : recharge ou achat, livraison ou retrait au dépôt. Installez l’application iGaz CI.',
};

const STEPS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'pin', title: 'Choisissez votre commune', text: 'Les dépôts qui livrent chez vous s’affichent, avec leur stock du moment.' },
  { icon: 'cart', title: 'Rechargez ou achetez', text: 'B6, B12, B24 ou B28 : échangez votre bouteille vide ou prenez-en une neuve.' },
  { icon: 'truck', title: 'Faites-vous livrer', text: 'Ou passez la retirer au dépôt. Payez à la livraison ou par mobile money.' },
];

const REASONS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'box', title: 'Stock en direct', text: 'Plus besoin de faire le tour des dépôts : vous voyez où la bouteille est disponible.' },
  { icon: 'tag', title: 'Prix affichés', text: 'Le prix de la recharge et de l’achat est connu avant de commander.' },
  { icon: 'shield', title: 'Remise sécurisée', text: 'La commande n’est terminée qu’avec votre code de confirmation.' },
  { icon: 'bell', title: 'Suivi de commande', text: 'Une notification à chaque étape : acceptée, en route, livrée.' },
];

/**
 * Site de présentation, affiché à l'ouverture du site dans un navigateur (voir Shell.tsx). L'application installée
 * (écran d'accueil, plus tard les stores) ouvre directement l'application.
 */
export default function Presentation() {
  return (
    <div className="landing">
      <header className="landing-hero night">
        <div className="landing-in">
          <nav className="landing-nav" aria-label="iGaz CI">
            <Logo light size={36} href={null} />
            <Link className="pill-link on-night" href="/connexion">Se connecter</Link>
          </nav>
          <div className="landing-hero-grid">
            <div className="stack">
              <p className="landing-kicker">Abidjan · 13 communes</p>
              <h1>Votre gaz, livré chez vous ou prêt au dépôt.</h1>
              <p className="landing-lead">
                Trouvez une bouteille disponible près de chez vous, rechargez ou achetez, et suivez votre commande jusqu’à
                votre porte.
              </p>
              <InstallApp light />
              <p className="small" style={{ opacity: 0.8 }}>Gratuit. Bientôt sur Google Play.</p>
            </div>
            <div className="landing-bottles" aria-hidden="true">
              <img src="/images/bouteilles/petroci-6.webp" alt="" style={{ height: '52%' }} />
              <img src="/images/bouteilles/petro-ivoire-12.webp" alt="" style={{ height: '82%' }} />
              <img src="/images/bouteilles/totalenergies-12.webp" alt="" style={{ height: '72%' }} />
            </div>
          </div>
        </div>
      </header>

      <main className="landing-in stack-lg landing-main">
        <section className="stack" aria-labelledby="how">
          <h2 id="how">Comment ça marche</h2>
          <ol className="landing-grid landing-steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className="card stack-sm">
                <span className="landing-icon"><Icon name={s.icon} size={22} /></span>
                <h3><span className="landing-num">{i + 1}.</span> {s.title}</h3>
                <p className="muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="stack" aria-labelledby="why">
          <h2 id="why">Pourquoi iGaz CI</h2>
          <ul className="landing-grid">
            {REASONS.map((r) => (
              <li key={r.title} className="card stack-sm">
                <span className="landing-icon"><Icon name={r.icon} size={22} /></span>
                <h3>{r.title}</h3>
                <p className="muted">{r.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="landing-band night stack" aria-labelledby="depot">
          <span className="landing-icon on-night"><Icon name="store" size={22} /></span>
          <h2 id="depot">Vous tenez un dépôt de gaz ?</h2>
          <p style={{ opacity: 0.85 }}>
            Recevez des commandes de votre quartier, mettez votre stock à jour depuis votre téléphone et suivez vos ventes.
            L’inscription est gratuite ; l’équipe iGaz valide chaque dépôt.
          </p>
          <div><Link className="btn" href="/connexion?next=%2Ffournisseur%2Finscription">Inscrire mon dépôt</Link></div>
        </section>

        <section className="card stack landing-final" aria-labelledby="install">
          <h2 id="install">Installez iGaz CI sur votre téléphone</h2>
          <p className="muted">L’application s’ouvre depuis votre écran d’accueil, en plein écran, et vous prévient à chaque étape de votre commande.</p>
          <InstallApp />
        </section>
      </main>

      <footer className="landing-foot">
        <div className="landing-in">
          <Logo size={28} href={null} />
          <nav className="landing-links" aria-label="Informations">
            <Link href="/aide">Aide et contact</Link>
            <Link href="/conditions">Conditions d’utilisation</Link>
            <Link href="/confidentialite">Confidentialité</Link>
            <Link href="/compte/supprimer">Supprimer mon compte</Link>
          </nav>
          <p className="small muted">© 2026 iGaz CI. Les marques de gaz citées appartiennent à leurs propriétaires.</p>
        </div>
      </footer>
    </div>
  );
}
