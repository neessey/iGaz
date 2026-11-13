'use client';
import { useCallback, useEffect, useState } from 'react';
import { Guard } from '@/components/Shell';
import { Empty, Loading, Notice, PageHead, StatusBadge } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { dateTime, fcfa, phoneFmt, STATUS_LABEL } from '@/lib/format';
import { Order, OrderStatus } from '@/lib/types';

const FINAL: OrderStatus[] = ['COMPLETED', 'REJECTED', 'CANCELLED'];

function OrderRow({ order, onChange }: { order: Order; onChange: () => void }) {
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Payée en ligne, y compris par le paiement unique d'un panier multi-dépôts.
  const paid = order.paidOnline ?? order.payments.some((p) => p.status === 'SUCCEEDED' && p.method === 'MOBILE_MONEY');

  async function cancel() {
    setBusy(true); setError(null);
    try { await api(`/admin/orders/${order.id}/cancel`, { body: { reason } }); onChange(); }
    catch (e) { setError(errorText(e)); setBusy(false); }
  }

  return (
    <article className="card stack-sm">
      <div className="split">
        <strong className="num" style={{ fontSize: '1.1rem' }}>#{order.code}</strong>
        <StatusBadge status={order.status} />
      </div>
      <p className="small">
        {order.store.name}, client {order.client ? phoneFmt(order.client.phone) : ''}. {order.items.map((i) => `${i.quantity} × ${i.product.brand.name} ${i.product.cylinderType.label}`).join(', ')}.
      </p>
      <p className="small"><span className="num price" style={{ fontSize: '1.1rem' }}>{fcfa(order.total)}</span> <span className="muted">{dateTime(order.createdAt)}</span></p>
      {paid && ['CANCELLED', 'REJECTED'].includes(order.status) && (
        <Notice>Paiement mobile money reçu : remboursement à traiter à la main.</Notice>
      )}
      {error && <Notice kind="error">{error}</Notice>}
      {!FINAL.includes(order.status) && !cancelling && (
        <button className="btn btn-danger btn-small" onClick={() => setCancelling(true)} style={{ alignSelf: 'flex-start' }}>Annuler cette commande</button>
      )}
      {cancelling && (
        <div className="stack-sm">
          <input className="input" aria-label="Motif de l’annulation" placeholder="Motif (obligatoire, gardé dans le journal)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="cluster">
            <button className="btn btn-danger btn-small" disabled={busy || reason.trim().length < 5} onClick={cancel}>Confirmer l’annulation</button>
            <button className="btn btn-quiet btn-small" onClick={() => setCancelling(false)}>Retour</button>
          </div>
          <p className="small muted">Si le dépôt avait déjà accepté la commande, le stock est remis automatiquement.</p>
        </div>
      )}
    </article>
  );
}

function Orders() {
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setOrders(null);
    api<Order[]>(`/orders${status ? `?status=${status}` : ''}`).then(setOrders).catch((e) => setError(errorText(e)));
  }, [status]);
  useEffect(load, [load]);

  return (
    <div className="stack-lg">
      <PageHead title="Commandes" back="/admin" />
      <label className="field" style={{ maxWidth: 320 }}>
        <span className="label">Filtrer par statut</span>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value as OrderStatus | '')}>
          <option value="">Tous les statuts</option>
          {(Object.keys(STATUS_LABEL) as OrderStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </label>
      {error && <Notice kind="error">{error}</Notice>}
      {!orders && !error && <Loading />}
      {orders?.length === 0 && <Empty title="Aucune commande avec ce statut" />}
      {orders && orders.length > 0 && <div className="rows">{orders.map((o) => <OrderRow key={o.id} order={o} onChange={load} />)}</div>}
    </div>
  );
}

export default function Page() {
  return <Guard roles={['ADMIN']}><Orders /></Guard>;
}
