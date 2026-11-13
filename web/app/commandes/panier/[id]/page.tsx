'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { Guard } from '@/components/Shell';
import { Loading, Notice, PageHead, StatusBadge } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { dateTime, fcfa } from '@/lib/format';
import { Checkout } from '@/lib/types';

const ACTIVE = ['PENDING_PAYMENT', 'SUBMITTED', 'ACCEPTED', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'];

/** Panier commandé : paiement unique (mobile money) et suivi de chaque commande, une par dépôt. */
function CheckoutView() {
  const { id } = useParams<{ id: string }>();
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<Checkout>(`/checkouts/${id}`).then(setCheckout).catch((e) => setError(errorText(e))), [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!checkout || !checkout.orders.some((o) => ACTIVE.includes(o.status))) return;
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [checkout, load]);

  async function pay() {
    if (!checkout) return;
    setBusy(true); setError(null); setInfo(null);
    try {
      // Une clé par tentative : un double clic rejoue la même clé et ne crée jamais deux transactions.
      const keyName = `igaz.pay.checkout.${checkout.id}`;
      const allFailed = checkout.payments.length > 0 && checkout.payments.every((p) => p.status === 'FAILED');
      let key: string | null = null;
      try { key = localStorage.getItem(keyName); } catch { /* ignoré */ }
      if (!key || allFailed) {
        key = crypto.randomUUID();
        try { localStorage.setItem(keyName, key); } catch { /* ignoré */ }
      }
      const p = await api<{ checkoutUrl: string | null }>(`/checkouts/${checkout.id}/payments`, { body: { idempotencyKey: key } });
      if (p.checkoutUrl) window.location.href = p.checkoutUrl;
      else setInfo('Le paiement mobile money n’est pas encore branché sur cette version. Les commandes restent en attente.');
      await load();
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  if (error && !checkout) return <div className="stack"><Notice kind="error">{error}</Notice><Link href="/commandes" className="btn btn-quiet">Mes commandes</Link></div>;
  if (!checkout) return <Loading />;

  const due = checkout.orders.filter((o) => o.status === 'PENDING_PAYMENT');
  const dueTotal = due.reduce((sum, o) => sum + o.total, 0);
  const many = checkout.orders.length > 1;

  return (
    <div className="stack-lg">
      <PageHead title="Votre panier" back="/commandes" />

      <section className="card stack-sm">
        <div className="split">
          <span className="num" style={{ fontSize: '1.35rem' }}>#{checkout.code}</span>
          <span className="badge badge-done">{checkout.orders.length} commande{many ? 's' : ''}</span>
        </div>
        <p className="small muted">Commandé le {dateTime(checkout.createdAt)}. Paiement {checkout.paymentMethod === 'MOBILE_MONEY' ? 'par mobile money, en une fois' : 'à la remise, à chaque dépôt'}.</p>
      </section>

      {error && <Notice kind="error">{error}</Notice>}
      {info && <Notice>{info}</Notice>}

      {checkout.paymentMethod === 'MOBILE_MONEY' && due.length > 0 && (
        <div className="panel panel-warn stack-sm">
          <h3>Payez pour envoyer {many ? 'vos commandes aux dépôts' : 'la commande au dépôt'}</h3>
          <p className="muted">
            Un seul paiement de {fcfa(dueTotal)}{many ? ` pour ${due.length} dépôts` : ''}. Les dépôts ne voient la commande qu’après la confirmation de l’opérateur.
          </p>
          <button className="btn" disabled={busy} onClick={pay}>Payer {fcfa(dueTotal)}</button>
        </div>
      )}

      <section className="stack-sm" aria-labelledby="commandes">
        <h2 id="commandes">{many ? 'Une commande par dépôt' : 'Votre commande'}</h2>
        {many && <p className="small muted">Chaque dépôt a son propre code de remise : ouvrez la commande pour le voir.</p>}
        <div className="rows">
          {checkout.orders.map((o) => (
            <Link key={o.id} href={`/commandes/${o.id}`} className="card card-link stack-sm">
              <div className="split" style={{ flexWrap: 'nowrap' }}>
                <span className="cluster" style={{ gap: 8, fontWeight: 800, flexWrap: 'nowrap' }}><Icon name="store" size={20} />{o.store.name}</span>
                <Icon name="chevron" size={18} />
              </div>
              <p className="small muted">{o.items.map((i) => `${i.quantity} × ${i.product.brand.name} ${i.product.cylinderType.label}`).join(', ')}</p>
              <div className="split">
                <StatusBadge status={o.status} />
                <span className="num price">{fcfa(o.total)}</span>
              </div>
              <p className="small muted">{o.fulfillment === 'DELIVERY' ? 'Livraison' : 'Retrait au dépôt'}{o.deliveryFee > 0 ? `, dont ${fcfa(o.deliveryFee)} de livraison` : ''}{(o.serviceFee ?? 0) > 0 ? ` et ${fcfa(o.serviceFee!)} de frais de service` : ''}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="card">
        <dl className="facts">
          <dt className="total">Total du panier</dt><dd className="total num price">{fcfa(checkout.total)}</dd>
        </dl>
      </section>
    </div>
  );
}

export default function Page() {
  return <Guard roles={['CLIENT']}><CheckoutView /></Guard>;
}
