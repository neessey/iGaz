import type { Metadata } from 'next';
import { RetryButton } from './RetryButton';

export const metadata: Metadata = {
  title: 'Pas de connexion · iGaz',
  robots: { index: false },
};

/**
 * Affichée par le service worker quand une page ne peut pas être chargée faute de réseau
 * (l'adresse reste celle de la page demandée, d'où le bouton « Réessayer » qui la recharge).
 */
export default function OfflinePage() {
  return (
    <div className="stack offline-page">
      <h1>Pas de connexion</h1>
      <p>
        iGaz a besoin d’internet pour voir le stock des dépôts et passer commande. Vérifiez vos données mobiles ou le
        wifi, puis réessayez.
      </p>
      <p className="muted">Vos commandes déjà passées ne sont pas perdues : vous les retrouverez dès que le réseau revient.</p>
      <RetryButton />
    </div>
  );
}
