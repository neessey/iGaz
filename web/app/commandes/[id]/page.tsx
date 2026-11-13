'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Guard } from '@/components/Shell';
import { Loading, Notice, StatusBadge } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { dateTime, fcfa, kindLabel, phoneFmt, STATUS_LABEL } from '@/lib/format';
import { Order } from '@/lib/types';

const ACTIVE = ['PENDING_PAYMENT', 'SUBMITTED', 'ACCEPTED', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'];

function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<Order>(`/orders/${id}`).then(setOrder).catch((e) => setError(errorText(e))), [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!order || !ACTIVE.includes(order.status)) return;
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [order, load]);

  async function cancel() {
    setBusy(true); setError(null);
    try { setOrder(await api<Order>(`/orders/${id}/cancel`, { method: 'POST', body: {} })); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  async function pay() {
    if (!order) return;
    setBusy(true); setError(null); setInfo(null);
    try {
      // Une clé par tentative : un double clic rejoue la même clé et ne crée jamais deux transactions.
      const keyName = `igaz.pay.${order.id}`;
      const allFailed = order.payments.length > 0 && order.payments.every((p) => p.status === 'FAILED');
      let key: string | null = null;
      try { key = localStorage.getItem(keyName); } catch { /* ignoré */ }
      if (!key || allFailed) {
        key = crypto.randomUUID();
        try { localStorage.setItem(keyName, key); } catch { /* ignoré */ }
      }
      const p = await api<{ checkoutUrl: string | null }>(`/orders/${order.id}/payments`, { body: { idempotencyKey: key } });
      if (p.checkoutUrl) window.location.href = p.checkoutUrl;
      else setInfo('Le paiement mobile money n’est pas encore branché sur cette version. La commande reste en attente.');
      await load();
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  if (error && !order) return <div className="stack"><Notice kind="error">{error}</Notice><Link href="/commandes" className="btn btn-quiet">Mes commandes</Link></div>;
  if (!order) return <Loading />;

  const cancellable = order.status === 'PENDING_PAYMENT' || order.status === 'SUBMITTED';
  const showCode = ['ACCEPTED', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'].includes(order.status) && order.confirmationCode;
  const needsPayment = order.status === 'PENDING_PAYMENT' && order.paymentMethod === 'MOBILE_MONEY';

  return (
    <div className="stack-lg">
      <Link href="/commandes" className="small">Mes commandes</Link>
      <div className="stack-sm">
        <h1>Votre commande</h1>
        <p className="num" style={{ fontSize: '1.4rem' }}>{order.code}</p>
        <StatusBadge status={order.status} />
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {info && <Notice>{info}</Notice>}

      {needsPayment && (
        <div className="panel panel-warn stack-sm">
          <h3>Payez pour envoyer la commande au dépôt</h3>
          <p className="muted">Le dépôt ne la voit qu’après la confirmation de votre paiement par l’opérateur.</p>
          <button className="btn" disabled={busy} onClick={pay}>Payer {fcfa(order.total)}</button>
        </div>
      )}

      {showCode && (
        <div className="panel panel-flag stack-sm">
          <h3>Votre code de remise</h3>
          <div><span className="code-plate" aria-label={`Code ${order.confirmationCode!.split('').join(' ')}`}>{order.confirmationCode}</span></div>
          <p>
            {order.fulfillment === 'DELIVERY'
              ? 'Donnez ce code au livreur seulement quand vous avez la bouteille en main.'
              : 'Donnez ce code au dépôt quand vous récupérez votre bouteille.'}
          </p>
        </div>
      )}

      <section className="stack-sm">
        <h2>Détail</h2>
        <div className="panel">
          <dl className="facts">
            {order.items.map((i) => (
              <div key={i.id} style={{ display: 'contents' }}>
                <dt>{i.quantity} × {kindLabel(i.kind)} {i.product.brand.name} {i.product.cylinderType.label}</dt>
                <dd className="num">{fcfa(i.unitPrice * i.quantity)}</dd>
              </div>
            ))}
            {order.fulfillment === 'DELIVERY' && (<><dt>Livraison</dt><dd className="num">{order.deliveryFee > 0 ? fcfa(order.deliveryFee) : 'Gratuite'}</dd></>)}
            <dt className="total">Total</dt><dd className="total num">{fcfa(order.total)}</dd>
          </dl>
        </div>
        <p className="small"><strong>{order.store.name}</strong>, {order.store.address}. Tél. {phoneFmt(order.store.phone)}</p>
        <p className="small muted">
          {order.fulfillment === 'DELIVERY' ? `Livraison à ${order.deliveryDetails}` : 'Retrait au dépôt'}.
          {' '}Paiement {order.paymentMethod === 'MOBILE_MONEY' ? 'par mobile money' : 'à la remise'}.
        </p>
      </section>

      <section className="stack-sm">
        <h2>Suivi</h2>
        <ol className="timeline">
          {order.events.map((e) => (
            <li key={e.id}>
              <strong>{STATUS_LABEL[e.status]}</strong>
              <span className="small muted" style={{ display: 'block' }}>{dateTime(e.createdAt)}{e.note ? `. ${e.note}` : ''}</span>
            </li>
          ))}
        </ol>
      </section>

      {cancellable ? (
        <button className="btn btn-danger" disabled={busy} onClick={cancel}>Annuler la commande</button>
      ) : ACTIVE.includes(order.status) ? (
        <p className="small muted">Le dépôt a accepté la commande : pour l’annuler, contactez-le au {phoneFmt(order.store.phone)}.</p>
      ) : null}
    </div>
  );
}

export default function Page() {
  return <Guard roles={['CLIENT']}><OrderDetail /></Guard>;
}
