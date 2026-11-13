'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Guard } from '@/components/Shell';
import { balanceText, MonthPicker, StatementFacts } from '@/components/Statement';
import { Empty, Loading, Notice, PageHead } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { dateTime, fcfa } from '@/lib/format';
import { currentMonth, Settlement, StatementTotals } from '@/lib/month';

interface Line {
  id: string; code: string; completedAt: string; paymentMethod: 'MOBILE_MONEY' | 'CASH_ON_DELIVERY';
  total: number; serviceFee: number; platformShare: number; depotOwes: number; platformOwes: number;
}
interface Statement extends StatementTotals { month: string; closed: boolean; settlement: Settlement | null; lines: Line[] }

/** Relevé mensuel du dépôt : ce qu'il doit à iGaz (espèces) et ce qu'iGaz lui doit (mobile money). */
function Releves() {
  const [store, setStore] = useState<{ id: string; name: string } | null | undefined>(undefined);
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<Statement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ id: string; name: string }[]>('/suppliers/me/stores').then((s) => setStore(s[0] ?? null)).catch((e) => setError(errorText(e)));
  }, []);
  useEffect(() => {
    if (!store) return;
    setData(null);
    api<Statement>(`/stores/${store.id}/statement?month=${month}`).then(setData).catch((e) => setError(errorText(e)));
  }, [store, month]);

  if (error) return <Notice kind="error">{error}</Notice>;
  if (store === undefined) return <Loading />;
  if (store === null) return (
    <div className="stack">
      <PageHead title="Mes relevés" back="/fournisseur" />
      <Empty title="Créez d’abord votre boutique" />
      <Link className="btn" href="/fournisseur/boutique">Créer ma boutique</Link>
    </div>
  );

  return (
    <div className="stack-lg">
      <div className="stack-sm">
        <PageHead title="Mes relevés" back="/fournisseur" />
        <p className="muted">
          {store.name}. Chaque mois, le relevé fait le compte entre vous et iGaz, sur les commandes terminées (code du client vérifié).
        </p>
      </div>
      <MonthPicker month={month} onChange={setMonth} />
      {!data ? <Loading /> : (
        <>
          <section className="card stack-sm" aria-label="Solde du mois">
            <p style={{ margin: 0, fontWeight: 800, fontSize: '1.2rem' }}>{balanceText(data.balance, 'depot')}</p>
            {data.settlement ? (
              <span className="badge badge-go" style={{ alignSelf: 'flex-start' }}>Réglé le {dateTime(data.settlement.createdAt)}</span>
            ) : data.closed ? (
              data.balance !== 0 && <p className="small muted">L’équipe iGaz vous contacte pour le règlement (Wave, Orange Money, virement…).</p>
            ) : (
              <p className="small muted">Mois en cours : le relevé change jusqu’à la fin du mois.</p>
            )}
            <StatementFacts s={data} />
          </section>

          <section className="stack-sm" aria-labelledby="detail">
            <h2 id="detail">Commandes du mois</h2>
            {data.lines.length === 0 ? <Empty title="Aucune commande terminée ce mois-ci" /> : (
              <div className="rows">
                {data.lines.map((l) => (
                  <article key={l.id} className="card stack-sm">
                    <div className="split"><strong className="num">#{l.code}</strong><span className="num">{fcfa(l.total)}</span></div>
                    <p className="small muted" style={{ margin: 0 }}>
                      {dateTime(l.completedAt)} · {l.paymentMethod === 'MOBILE_MONEY' ? 'mobile money' : 'espèces'}
                      {' · '}{l.depotOwes > 0 ? `vous devez ${fcfa(l.depotOwes)}` : l.platformOwes > 0 ? `iGaz vous doit ${fcfa(l.platformOwes)}` : 'rien à régler'}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default function Page() {
  return <Guard roles={['SUPPLIER']}><Releves /></Guard>;
}
