'use client';
import { fcfa } from '@/lib/format';
import { currentMonth, monthLabel, shiftMonth, StatementTotals } from '@/lib/month';
import { Icon } from './Icon';

/** Choix du mois d'un relevé : précédent / suivant (pas au-delà du mois en cours). */
export function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const last = month >= currentMonth();
  return (
    <div className="split" role="group" aria-label="Mois du relevé">
      <button className="icon-btn" aria-label="Mois précédent" onClick={() => onChange(shiftMonth(month, -1))}>
        <Icon name="back" size={20} />
      </button>
      <strong style={{ textTransform: 'capitalize' }}>{monthLabel(month)}</strong>
      <button className="icon-btn" aria-label="Mois suivant" disabled={last} onClick={() => onChange(shiftMonth(month, 1))}
        style={{ transform: 'scaleX(-1)', opacity: last ? 0.35 : 1 }}>
        <Icon name="back" size={20} />
      </button>
    </div>
  );
}

/** Solde d'un relevé, dit du point de vue de celui qui lit (le dépôt ou iGaz). */
export function balanceText(balance: number, reader: 'depot' | 'admin') {
  if (balance === 0) return 'Rien à régler';
  if (balance > 0) return reader === 'depot' ? `Vous devez ${fcfa(balance)} à iGaz` : `Le dépôt doit ${fcfa(balance)} à iGaz`;
  return reader === 'depot' ? `iGaz vous doit ${fcfa(-balance)}` : `iGaz doit ${fcfa(-balance)} au dépôt`;
}

/** Chiffres d'un relevé : ventes terminées, part iGaz, dû de part et d'autre. */
export function StatementFacts({ s }: { s: StatementTotals }) {
  return (
    <dl className="facts">
      <dt>Commandes terminées</dt><dd className="num">{s.orders}</dd>
      <dt>Ventes (total payé par les clients)</dt><dd className="num">{fcfa(s.sales)}</dd>
      <dt>Frais de service (payés par les clients)</dt><dd className="num">{fcfa(s.serviceFees)}</dd>
      <dt>Part iGaz sur la livraison</dt><dd className="num">{fcfa(s.deliveryShares)}</dd>
      <dt>Dû à iGaz (commandes payées en espèces)</dt><dd className="num">{fcfa(s.depotOwes)}</dd>
      <dt>Dû au dépôt (commandes payées en mobile money)</dt><dd className="num">{fcfa(s.platformOwes)}</dd>
    </dl>
  );
}
