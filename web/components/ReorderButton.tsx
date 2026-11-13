'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCart } from '@/lib/cart';
import { reorder } from '@/lib/reorder';
import { Order } from '@/lib/types';
import { Icon } from './Icon';
import { Notice } from './ui';

/** Remet la commande dans le panier (prix et stock du jour) puis ouvre le panier. */
export function ReorderButton({ order, block = false }: { order: Order; block?: boolean }) {
  const cart = useCart();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setBusy(true); setMessage(null);
    const r = await reorder(order, cart.add);
    setBusy(false);
    if (r.error) { setMessage(r.error); return; }
    if (r.added.length === 0) { setMessage(`Plus disponible chez ${order.store.name} pour le moment : ${r.missing.join(', ')}.`); return; }
    router.push(r.missing.length ? `/panier?indisponible=${encodeURIComponent(r.missing.join(', '))}` : '/panier');
  }

  return (
    <div className="stack-sm">
      <button className={`btn btn-quiet${block ? ' btn-block' : ' btn-small'}`} disabled={busy} onClick={run}>
        <Icon name="swap" size={18} />{busy ? 'Ajout au panier…' : 'Commander à nouveau'}
      </button>
      {message && <Notice kind="error">{message}</Notice>}
    </div>
  );
}
