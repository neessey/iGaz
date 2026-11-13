'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Guard } from '@/components/Shell';
import { Empty, Loading, Notice, StatusBadge } from '@/components/ui';
import { api, ApiError, errorText } from '@/lib/api';
import { dateTime, fcfa, kindLabel, phoneFmt } from '@/lib/format';
import { Order } from '@/lib/types';

interface SupplierMe { status: 'PENDING' | 'APPROVED' | 'SUSPENDED' | 'REJECTED'; businessName: string; stores: { id: string }[] }

function OrderCard({ order, onChange }: { order: Order; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [code, setCode] = useState('');

  async function act(action: string, body: object = {}) {
    setBusy(true); setError(null);
    try { await api(`/orders/${order.id}/${action}`, { method: 'POST', body }); onChange(); setRejecting(false); setCode(''); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  const delivery = order.fulfillment === 'DELIVERY';
  const cash = order.paymentMethod === 'CASH_ON_DELIVERY';

  return (
    <article className="panel stack-sm">
      <div className="split">
        <strong className="num" style={{ fontSize: '1.3rem' }}>{order.code}</strong>
        <StatusBadge status={order.status} />
      </div>
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {order.items.map((i) => (
          <li key={i.id}>
            <strong>{i.quantity} ×</strong> {kindLabel(i.kind)} {i.product.brand.name} {i.product.cylinderType.label}
            {i.kind === 'EXCHANGE' && <span className="muted"> (le client remet une vide)</span>}
          </li>
        ))}
      </ul>
      <p className="small">
        {delivery ? <>Livrer à <strong>{order.deliveryDetails}</strong></> : <strong>Retrait au dépôt</strong>}
        {order.client && (
          <> pour {order.client.name ?? 'le client'}, <a href={`tel:${order.client.phone}`}>{phoneFmt(order.client.phone)}</a></>
        )}.
      </p>
      <p className="small">
        <strong className="num" style={{ fontSize: '1.2rem' }}>{fcfa(order.total)}</strong>
        {cash ? ' à encaisser à la remise' : ' déjà payé en mobile money'}. <span className="muted">{dateTime(order.createdAt)}</span>
      </p>

      {error && <Notice kind="error">{error}</Notice>}

      {order.status === 'SUBMITTED' && !rejecting && (
        <div className="cluster">
          <button className="btn" disabled={busy} onClick={() => act('accept')}>Accepter</button>
          <button className="btn btn-quiet" disabled={busy} onClick={() => setRejecting(true)}>Refuser</button>
        </div>
      )}
      {order.status === 'SUBMITTED' && rejecting && (
        <div className="stack-sm">
          <input className="input" placeholder="Motif (ex. plus de stock)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Motif du refus" />
          <div className="cluster">
            <button className="btn btn-danger" disabled={busy || reason.trim().length < 3} onClick={() => act('reject', { reason })}>Confirmer le refus</button>
            <button className="btn btn-quiet" onClick={() => setRejecting(false)}>Retour</button>
          </div>
        </div>
      )}
      {order.status === 'ACCEPTED' && (
        <button className="btn" disabled={busy} onClick={() => act(delivery ? 'dispatch' : 'ready')}>
          {delivery ? 'Le livreur est parti' : 'La commande est prête'}
        </button>
      )}
      {(order.status === 'OUT_FOR_DELIVERY' || order.status === 'READY_FOR_PICKUP') && (
        <div className="stack-sm">
          <label className="field">
            <span className="label">Code donné par le client à la remise</span>
            <input className="input input-code" inputMode="numeric" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </label>
          <button className="btn" disabled={busy || code.length !== 6} onClick={() => act('complete', { code })}>Terminer la commande</button>
        </div>
      )}
    </article>
  );
}

function Dashboard() {
  const [me, setMe] = useState<SupplierMe | null | 'none'>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = useCallback(() => api<Order[]>('/orders').then(setOrders).catch((e) => setError(errorText(e))), []);

  useEffect(() => {
    api<SupplierMe>('/suppliers/me').then(setMe).catch((e) => {
      if (e instanceof ApiError && e.status === 404) setMe('none'); else setError(errorText(e));
    });
  }, []);
  useEffect(() => {
    if (me && me !== 'none' && me.status === 'APPROVED') {
      loadOrders();
      const t = setInterval(loadOrders, 15000);
      return () => clearInterval(t);
    }
  }, [me, loadOrders]);

  if (error) return <Notice kind="error">{error}</Notice>;
  if (!me) return <Loading />;
  if (me === 'none') return (
    <div className="stack">
      <h1>Votre espace fournisseur</h1>
      <Link className="btn" href="/fournisseur/inscription">Ouvrir ma boutique</Link>
    </div>
  );
  if (me.status !== 'APPROVED') {
    const text = {
      PENDING: 'Votre demande est en cours de validation. Vous pourrez créer votre boutique dès qu’elle sera acceptée.',
      REJECTED: 'Votre demande n’a pas été acceptée. Contactez l’équipe iGaz pour en savoir plus.',
      SUSPENDED: 'Votre compte est suspendu. Contactez l’équipe iGaz pour le réactiver.',
    }[me.status];
    return (
      <div className="stack">
        <h1>{me.businessName}</h1>
        <div className={`panel ${me.status === 'PENDING' ? 'panel-warn' : 'panel-stop'}`}><p>{text}</p></div>
      </div>
    );
  }

  const by = (...s: Order['status'][]) => (orders ?? []).filter((o) => s.includes(o.status));
  const sections: [string, Order[]][] = [
    ['À accepter', by('SUBMITTED')],
    ['À préparer', by('ACCEPTED')],
    ['En cours de remise', by('OUT_FOR_DELIVERY', 'READY_FOR_PICKUP')],
  ];
  const nothing = sections.every(([, list]) => list.length === 0);
  const recent = by('COMPLETED', 'REJECTED', 'CANCELLED').slice(0, 5);

  return (
    <div className="stack-lg">
      <h1>{me.businessName}</h1>
      {me.stores.length === 0 && (
        <div className="panel panel-warn stack-sm">
          <h3>Créez votre boutique</h3>
          <p className="muted">Ajoutez l’adresse, les horaires et les communes que vous desservez pour recevoir des commandes.</p>
          <Link className="btn" href="/fournisseur/boutique">Créer ma boutique</Link>
        </div>
      )}
      {!orders && <Loading />}
      {orders && nothing && me.stores.length > 0 && (
        <Empty title="Aucune commande à traiter">Les nouvelles commandes apparaissent ici. Pensez à tenir votre stock à jour.</Empty>
      )}
      {sections.filter(([, l]) => l.length > 0).map(([title, list]) => (
        <section key={title} className="stack-sm" aria-label={title}>
          <h2>{title} <span className="muted">({list.length})</span></h2>
          {list.map((o) => <OrderCard key={o.id} order={o} onChange={loadOrders} />)}
        </section>
      ))}
      {recent.length > 0 && (
        <section className="stack-sm">
          <h2>Dernières commandes terminées</h2>
          <div className="rows">
            {recent.map((o) => (
              <div key={o.id} className="split small">
                <span><strong>{o.code}</strong> <span className="muted">{dateTime(o.createdAt)}</span></span>
                <span className="cluster"><StatusBadge status={o.status} /><span className="num">{fcfa(o.total)}</span></span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function Page() {
  return <Guard roles={['SUPPLIER']}><Dashboard /></Guard>;
}
