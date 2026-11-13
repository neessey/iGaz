'use client';
import { useCallback, useEffect, useState } from 'react';
import { Guard } from '@/components/Shell';
import { balanceText, MonthPicker } from '@/components/Statement';
import { Empty, Field, Loading, Notice, PageHead } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { dateTime, fcfa, phoneFmt } from '@/lib/format';
import { currentMonth, monthLabel, Settlement, StatementTotals } from '@/lib/month';

interface Fees { serviceFee: number; deliveryShare: number }
interface StoreLine extends StatementTotals {
  store: { id: string; name: string; phone: string; supplier: { businessName: string } };
  settlement: Settlement | null;
}
interface Month extends StatementTotals { month: string; closed: boolean; settings: Fees; stores: StoreLine[] }

/** Réglages des frais : ne s'appliquent qu'aux nouvelles commandes (journal d'audit). */
function FeesForm({ current, onSaved }: { current: Fees; onSaved: () => void }) {
  const [serviceFee, setServiceFee] = useState(current.serviceFee);
  const [deliveryShare, setDeliveryShare] = useState(current.deliveryShare);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const changed = serviceFee !== current.serviceFee || deliveryShare !== current.deliveryShare;

  async function save() {
    setBusy(true); setMsg(null);
    try {
      await api('/admin/revenue/settings', { method: 'PATCH', body: { serviceFee, deliveryShare } });
      setMsg({ kind: 'ok', text: 'Réglages enregistrés : ils s’appliquent aux prochaines commandes.' });
      onSaved();
    } catch (e) { setMsg({ kind: 'error', text: errorText(e) }); }
    finally { setBusy(false); }
  }

  return (
    <section className="card stack" aria-labelledby="reglages">
      <h2 id="reglages">Réglages</h2>
      <div className="cluster" style={{ alignItems: 'flex-end' }}>
        <Field label="Frais de service par commande (F)" hint="Payés par le client, ajoutés au total.">
          <input className="input" type="number" min={0} max={2000} step={50} value={serviceFee}
            onChange={(e) => setServiceFee(Math.max(0, Math.round(Number(e.target.value) || 0)))} />
        </Field>
        <Field label="Part iGaz sur la livraison (F)" hint="Payée par le dépôt, jamais plus que ses frais de livraison.">
          <input className="input" type="number" min={0} max={5000} step={50} value={deliveryShare}
            onChange={(e) => setDeliveryShare(Math.max(0, Math.round(Number(e.target.value) || 0)))} />
        </Field>
      </div>
      <p className="small muted">Les commandes déjà passées gardent les montants du jour de leur création.</p>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <button className="btn" disabled={busy || !changed} onClick={save}>Enregistrer les réglages</button>
    </section>
  );
}

function StoreRow({ line, month, closed, onSettled }: { line: StoreLine; month: string; closed: boolean; onSettled: () => void }) {
  const [note, setNote] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function settle() {
    setBusy(true); setError(null);
    try {
      await api(`/admin/revenue/stores/${line.store.id}/${month}/settle`, { body: { note: note.trim() || undefined } });
      onSettled();
    } catch (e) { setError(errorText(e)); setBusy(false); }
  }

  return (
    <article className="card stack-sm">
      <div className="split">
        <span>
          <strong style={{ display: 'block' }}>{line.store.name}</strong>
          <span className="small muted">{line.store.supplier.businessName} · <a href={`tel:${line.store.phone}`}>{phoneFmt(line.store.phone)}</a></span>
        </span>
        <span className="num" style={{ fontWeight: 800 }}>{fcfa(line.revenue)}</span>
      </div>
      <p className="small" style={{ margin: 0 }}>
        {line.orders} commande{line.orders > 1 ? 's' : ''} · {balanceText(line.balance, 'admin')}
      </p>
      {line.settlement ? (
        <span className="badge badge-go" style={{ alignSelf: 'flex-start' }}>
          Réglé le {dateTime(line.settlement.createdAt)}{line.settlement.note ? ` · ${line.settlement.note}` : ''}
        </span>
      ) : closed && line.orders > 0 ? (
        open ? (
          <div className="stack-sm">
            <Field label="Note (moyen et référence du paiement)">
              <input className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. Wave, réf. 12345" />
            </Field>
            {error && <Notice kind="error">{error}</Notice>}
            <div className="cluster">
              <button className="btn btn-small" disabled={busy} onClick={settle}>Confirmer : {balanceText(line.balance, 'admin').toLowerCase()} est réglé</button>
              <button className="btn btn-quiet btn-small" onClick={() => setOpen(false)}>Annuler</button>
            </div>
          </div>
        ) : (
          <button className="btn btn-quiet btn-small" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>Marquer comme réglé</button>
        )
      ) : null}
    </article>
  );
}

/** Revenus d'iGaz : réglages des frais, total du mois et relevé de chaque dépôt. */
function Revenus() {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<Month | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Month>(`/admin/revenue?month=${month}`).then(setData).catch((e) => setError(errorText(e)));
  }, [month]);
  useEffect(() => { setData(null); load(); }, [load]);

  return (
    <div className="stack-lg">
      <PageHead title="Revenus" back="/admin" />
      {error && <Notice kind="error">{error}</Notice>}
      {data && <FeesForm key={`${data.settings.serviceFee}-${data.settings.deliveryShare}`} current={data.settings} onSaved={load} />}
      <MonthPicker month={month} onChange={setMonth} />
      {!data ? <Loading /> : (
        <>
          <section className="night card stack-sm" aria-label={`Revenus de ${monthLabel(month)}`} style={{ borderRadius: 18 }}>
            <span className="small" style={{ opacity: 0.85 }}>Revenus iGaz, commandes terminées</span>
            <strong className="num" style={{ fontSize: '1.8rem' }}>{fcfa(data.revenue)}</strong>
            <span className="small" style={{ opacity: 0.85 }}>
              {data.orders} commande{data.orders > 1 ? 's' : ''} · {fcfa(data.serviceFees)} de frais de service · {fcfa(data.deliveryShares)} sur la livraison
            </span>
          </section>
          {!data.closed && <p className="small muted">Mois en cours : les relevés se règlent une fois le mois terminé.</p>}
          {data.stores.length === 0 ? <Empty title="Aucune commande terminée ce mois-ci" /> : (
            <div className="rows">
              {data.stores.map((l) => <StoreRow key={l.store.id} line={l} month={month} closed={data.closed} onSettled={load} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function Page() {
  return <Guard roles={['ADMIN']}><Revenus /></Guard>;
}
