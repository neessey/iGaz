'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { ReorderButton } from '@/components/ReorderButton';
import { OrderReview } from '@/components/Reviews';
import { Guard } from '@/components/Shell';
import { Loading, Notice, PageHead, StatusBadge } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { dateTime, fcfa, kindLabel, phoneFmt, STATUS_LABEL } from '@/lib/format';
import { initials } from '@/lib/media';
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
  const stopped = order.status === 'REJECTED' || order.status === 'CANCELLED';
  const last = order.events.length - 1;

  return (
    <div className="stack-lg">
      <PageHead title="Suivi de commande" back="/commandes" />

      <section className="card stack-sm">
        <div className="split">
          <span className="num" style={{ fontSize: '1.35rem' }}>#{order.code}</span>
          <StatusBadge status={order.status} />
        </div>
        <p className="small muted">Commandée le {dateTime(order.createdAt)}</p>
        {order.checkout && (
          <Link className="link-more" href={`/commandes/panier/${order.checkout.id}`}>
            <Icon name="cart" size={16} />Fait partie du panier #{order.checkout.code}
          </Link>
        )}
      </section>

      {error && <Notice kind="error">{error}</Notice>}
      {info && <Notice>{info}</Notice>}

      {needsPayment && (
        <div className="panel panel-warn stack-sm">
          <h3>Payez pour envoyer la commande au dépôt</h3>
          <p className="muted">Le dépôt ne la voit qu’après la confirmation de votre paiement par l’opérateur.</p>
          {order.checkout
            ? <Link className="btn" href={`/commandes/panier/${order.checkout.id}`}>Payer le panier en une fois</Link>
            : <button className="btn" disabled={busy} onClick={pay}>Payer {fcfa(order.total)}</button>}
        </div>
      )}

      {showCode && (
        <div className="card stack-sm" style={{ textAlign: 'center' }}>
          <h3>Votre code de remise</h3>
          <div><span className="code-plate" aria-label={`Code ${order.confirmationCode!.split('').join(' ')}`}>{order.confirmationCode}</span></div>
          <p className="small muted" style={{ margin: '0 auto' }}>
            {order.fulfillment === 'DELIVERY'
              ? 'Donnez ce code au livreur seulement quand vous avez la bouteille en main.'
              : 'Donnez ce code au dépôt quand vous récupérez votre bouteille.'}
          </p>
        </div>
      )}

      <section className="card">
        <ol className="timeline" aria-label="Étapes de la commande">
          {order.events.map((e, i) => (
            <li key={e.id} className={i === last ? (stopped ? 'stop' : ACTIVE.includes(e.status) ? 'current' : '') : ''}>
              <strong>{STATUS_LABEL[e.status]}</strong>
              <span className="small muted" style={{ display: 'block' }}>{dateTime(e.createdAt)}{e.note ? `. ${e.note}` : ''}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="card activity" aria-label="Votre dépôt">
        <span className="avatar" style={{ width: 44, height: 44, fontSize: '1rem' }}>{initials(order.store.name)}</span>
        <span style={{ minWidth: 0 }}>
          <span className="small muted" style={{ display: 'block' }}>{order.fulfillment === 'DELIVERY' ? 'Livré par' : 'À retirer chez'}</span>
          <strong style={{ display: 'block' }}>{order.store.name}</strong>
          <span className="small">{phoneFmt(order.store.phone)}</span>
        </span>
        <a className="icon-btn" href={`tel:${order.store.phone}`} aria-label={`Appeler ${order.store.name}`}><Icon name="phone" size={20} /></a>
      </section>

      <section className="card stack-sm">
        <h2>Détail</h2>
        <dl className="facts">
          {order.items.map((i) => (
            <div key={i.id} style={{ display: 'contents' }}>
              <dt>{i.quantity} × {kindLabel(i.kind)} {i.product.brand.name} {i.product.cylinderType.label}</dt>
              <dd className="num">{fcfa(i.unitPrice * i.quantity)}</dd>
            </div>
          ))}
          {order.fulfillment === 'DELIVERY' && (<><dt>Livraison</dt><dd className="num">{order.deliveryFee > 0 ? fcfa(order.deliveryFee) : 'Gratuite'}</dd></>)}
          {(order.serviceFee ?? 0) > 0 && (<><dt>Frais de service</dt><dd className="num">{fcfa(order.serviceFee!)}</dd></>)}
          <dt className="total">Total</dt><dd className="total num price">{fcfa(order.total)}</dd>
        </dl>
        <p className="small muted">
          {order.fulfillment === 'DELIVERY' ? `Livraison à ${order.deliveryDetails}` : `Retrait au dépôt, ${order.store.address}`}.
          {' '}Paiement {order.paymentMethod === 'MOBILE_MONEY' ? 'par mobile money' : 'à la remise'}.
        </p>
      </section>

      {order.status === 'COMPLETED' && (
        <OrderReview key={order.review?.id ?? 'nouveau'} orderId={order.id} storeName={order.store.name} review={order.review} onSaved={load} />
      )}

      {cancellable ? (
        <button className="btn btn-danger btn-block" disabled={busy} onClick={cancel}>Annuler la commande</button>
      ) : ACTIVE.includes(order.status) ? (
        <p className="small muted">Le dépôt a accepté la commande : pour l’annuler, appelez-le au {phoneFmt(order.store.phone)}.</p>
      ) : (
        <ReorderButton order={order} block />
      )}
    </div>
  );
}

export default function Page() {
  return <Guard roles={['CLIENT']}><OrderDetail /></Guard>;
}
