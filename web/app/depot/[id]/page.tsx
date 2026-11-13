'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { AddToCartSheet } from '@/components/AddToCart';
import { Cylinder } from '@/components/Cylinder';
import { Icon } from '@/components/Icon';
import { StoreCover } from '@/components/StoreCard';
import { Empty, Loading, Notice } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { fcfa, phoneFmt } from '@/lib/format';
import { brandColor } from '@/lib/media';
import { useSession } from '@/lib/session';
import { closesSoon, groupByStore } from '@/lib/stores';
import { Offer } from '@/lib/types';

/** Page d'un dépôt : ses bouteilles disponibles, par taille, avec ajout rapide au panier (« + »). */
function StorePage() {
  const { id } = useParams<{ id: string }>();
  const backHref = '/#depots';
  const { user } = useSession();
  const cart = useCart();
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<Offer | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api<Offer[]>(`/products?storeId=${id}`).then(setOffers).catch((e) => setError(errorText(e)));
  }, [id]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const summary = useMemo(() => (offers && offers.length ? groupByStore(offers)[0] : null), [offers]);
  const bySize = useMemo(() => {
    const map = new Map<string, Offer[]>();
    for (const o of [...(offers ?? [])].sort((a, b) => a.cylinderType.capacityKg - b.cylinderType.capacityKg || a.purchasePrice - b.purchasePrice)) {
      const key = `${o.cylinderType.label} · ${o.cylinderType.capacityKg} kg`;
      map.set(key, [...(map.get(key) ?? []), o]);
    }
    return [...map.entries()];
  }, [offers]);

  if (error) return <div className="stack"><Notice kind="error">{error}</Notice><Link className="btn btn-quiet" href={backHref}>Retour aux dépôts</Link></div>;
  if (!offers) return <Loading />;
  if (!summary) {
    return (
      <div className="stack-lg">
        <Link href={backHref} className="back" aria-label="Retour aux dépôts"><Icon name="back" size={20} /></Link>
        <Empty title="Rien de disponible pour le moment">Ce dépôt est fermé ou n’a plus de bouteilles en stock. Essayez un autre dépôt.</Empty>
        <Link className="btn btn-block" href={backHref}>Voir les autres dépôts</Link>
      </div>
    );
  }

  const { store } = summary;
  const notClient = !!user && user.role !== 'CLIENT';
  const inCart = (productId: string) => cart.lines.filter((l) => l.productId === productId).reduce((n, l) => n + l.quantity, 0);
  const soon = closesSoon(store.opensAt, store.closesAt);

  return (
    <div className="stack-lg wide">
      <div className="store-hero">
        <Link href={backHref} className="back" aria-label="Retour aux dépôts"><Icon name="back" size={20} /></Link>
        <StoreCover summary={summary} />
      </div>

      <section className="card store-head stack-sm">
        <h1 style={{ fontSize: '1.45rem' }}>{store.name}</h1>
        <p className="meta"><span><Icon name="pin" size={15} />{store.address}</span></p>
        <div className="cluster" style={{ gap: 8 }}>
          {store.offersDelivery && (
            <span className="badge badge-go"><Icon name="truck" size={14} />
              {store.deliveryFee > 0 ? `Livraison ${fcfa(store.deliveryFee)}` : 'Livraison gratuite'}</span>
          )}
          {store.offersPickup && <span className="badge badge-go"><Icon name="store" size={14} />Retrait au dépôt</span>}
          <span className={`badge ${soon ? 'badge-wait' : 'badge-done'}`}><Icon name="clock" size={14} />{soon ? `Ferme à ${store.closesAt}` : `${store.opensAt} – ${store.closesAt}`}</span>
        </div>
        <a className="link-more" href={`tel:${store.phone}`}><Icon name="phone" size={16} />Appeler le dépôt · {phoneFmt(store.phone)}</a>
      </section>

      {notClient && <Notice>Seuls les comptes clients peuvent commander.</Notice>}
      {toast && <div className="notice notice-ok" role="status">{toast}</div>}

      <div className="depot-sizes">
      {bySize.map(([size, list]) => (
        <section key={size} aria-label={size}>
          <h2>{size}</h2>
          <div className="card" style={{ paddingTop: 4, paddingBottom: 4 }}>
            {list.map((o) => {
              const n = inCart(o.id);
              const stock = o.inventory?.quantity ?? 0;
              return (
                <div key={o.id} className="menu-row">
                  <span className="offer-media" style={{ width: 64, height: 64 }}>
                    <Cylinder brand={o.brand.name} kg={o.cylinderType.capacityKg} color={brandColor(o.brand.name)} scale={o.cylinderType.capacityKg >= 12 ? 0.55 : 0.66} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <Link href={`/produit/${o.id}`} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 800, display: 'block' }}>{o.brand.name} {o.cylinderType.label}</Link>
                    <span className="small" style={{ display: 'block' }}>
                      Échange <strong className="price">{fcfa(o.exchangePrice)}</strong>
                      <span className="muted"> · achat {fcfa(o.purchasePrice)}</span>
                    </span>
                    {stock <= 3 && <span className="stock-dot low" style={{ fontSize: '0.8rem' }}>Plus que {stock}</span>}
                  </span>
                  <button className="add-btn" disabled={notClient} onClick={() => setAdding(o)}
                    aria-label={`Ajouter ${o.brand.name} ${o.cylinderType.label} au panier${n ? `, ${n} déjà dans le panier` : ''}`}>
                    <Icon name="plus" size={22} />
                    {n > 0 && <span className="in-cart" aria-hidden="true">{n}</span>}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      </div>

      <p className="small muted">Prix en FCFA. L’échange suppose une bouteille vide de même marque et même taille.</p>

      {adding && <AddToCartSheet offer={adding} onClose={() => setAdding(null)} onAdded={setToast} />}
    </div>
  );
}

export default function Page() {
  return <Suspense><StorePage /></Suspense>;
}
