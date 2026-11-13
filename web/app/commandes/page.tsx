'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Guard } from '@/components/Shell';
import { Empty, Loading, Notice, StatusBadge } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { dateTime, fcfa } from '@/lib/format';
import { Order } from '@/lib/types';

function Orders() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<Order[]>('/orders').then(setOrders).catch((e) => setError(errorText(e))); }, []);

  return (
    <div className="stack-lg">
      <h1>Mes commandes</h1>
      {error && <Notice kind="error">{error}</Notice>}
      {!orders && !error && <Loading />}
      {orders?.length === 0 && (
        <Empty title="Aucune commande pour l’instant">
          Trouvez une bouteille près de chez vous pour passer votre première commande.
        </Empty>
      )}
      {orders && orders.length > 0 && (
        <div className="rows">
          {orders.map((o) => (
            <Link key={o.id} href={`/commandes/${o.id}`} className="stack-sm" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
              <span className="split">
                <strong>{o.store.name}</strong>
                <span className="num" style={{ fontSize: '1.4rem' }}>{fcfa(o.total)}</span>
              </span>
              <span className="small muted" style={{ display: 'block' }}>
                {o.items.map((i) => `${i.quantity} × ${i.product.brand.name} ${i.product.cylinderType.label}`).join(', ')}
              </span>
              <span className="split small">
                <StatusBadge status={o.status} />
                <span className="muted">{o.code}, {dateTime(o.createdAt)}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
      <Link href="/" className="btn btn-quiet">Trouver du gaz</Link>
    </div>
  );
}

export default function Page() {
  return <Guard roles={['CLIENT']}><Orders /></Guard>;
}
