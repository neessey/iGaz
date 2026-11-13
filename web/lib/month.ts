/** Mois « AAAA-MM » (heure d'Abidjan = UTC), comme l'API des relevés. */
export const currentMonth = () => new Date().toISOString().slice(0, 7);

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** « novembre 2026 » */
export function monthLabel(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Relevé tel que renvoyé par l'API (balance > 0 : le dépôt doit cette somme à iGaz ; < 0 : iGaz la doit au dépôt). */
export interface StatementTotals {
  orders: number; sales: number; serviceFees: number; deliveryShares: number; revenue: number;
  depotOwes: number; platformOwes: number; balance: number;
}
export interface Settlement { id: string; amount: number; note: string | null; createdAt: string }
