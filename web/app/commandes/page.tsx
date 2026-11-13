'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Cylinder } from '@/components/Cylinder';
import { ReorderButton } from '@/components/ReorderButton';
import { Guard } from '@/components/Shell';
import { Empty, Loading, Notice, PageHead, StatusBadge } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { dateTime, fcfa } from '@/lib/format';
import { brandColor } from '@/lib/media';
import { Order } from '@/lib/types';

function Orders() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<Order[]>('/orders').then(setOrders).catch((e) => setError(errorText(e))); }, []);

  return (
    <div className="stack-lg">
      <PageHead title="Mes commandes" />
      {error && <Notice kind="error">{error}</Notice>}
      {!orders && !error && <Loading />}
      {orders?.length === 0 && (
        <Empty title="Aucune commande pour l’instant">
          Trouvez une bouteille près de chez vous pour passer votre première commande.
        </Empty>
      )}
      {orders && orders.length > 0 && (
        <div className="rows">
          {orders.map((o) => {
            const first = o.items[0];
            const done = ['COMPLETED', 'REJECTED', 'CANCELLED'].includes(o.status);
            return (
              <div key={o.id} className="stack-sm">
              <Link href={`/commandes/${o.id}`} className="card offer">
                <span className="offer-media">
                  {first && <Cylinder kg={first.product.cylinderType.capacityKg} color={brandColor(first.product.brand.name)} scale={first.product.cylinderType.capacityKg >= 12 ? 0.65 : 0.8} />}
                </span>
                <span className="stack-sm" style={{ minWidth: 0 }}>
                  <span className="offer-title" style={{ display: 'block' }}>
                    {o.items.map((i) => `${i.quantity} × ${i.product.brand.name} ${i.product.cylinderType.label}`).join(', ')}
                  </span>
                  <span className="meta">
                    <span>{o.store.name}</span><span>{dateTime(o.createdAt)}</span>
                    {o.checkout && <span>Panier #{o.checkout.code}</span>}
                  </span>
                  <StatusBadge status={o.status} />
                </span>
                <span className="offer-price"><span className="num big price">{fcfa(o.total)}</span></span>
              </Link>
              {done && <ReorderButton order={o} />}
              </div>
            );
          })}
        </div>
      )}
      <Link href="/" className="btn btn-quiet btn-block">Trouver du gaz</Link>
    </div>
  );
}

export default function Page() {
  return <Guard roles={['CLIENT']}><Orders /></Guard>;
}
