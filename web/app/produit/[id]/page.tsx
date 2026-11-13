'use client';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Cylinder } from '@/components/Cylinder';
import { Icon } from '@/components/Icon';
import { Loading, Notice } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { fcfa, phoneFmt } from '@/lib/format';
import { brandColor, IMAGES, productPhoto } from '@/lib/media';
import { useSession } from '@/lib/session';
import { Offer } from '@/lib/types';

function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useSession();
  const cart = useCart();

  const [offer, setOffer] = useState<Offer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [kind, setKind] = useState<'PURCHASE' | 'EXCHANGE'>(params.get('kind') === 'PURCHASE' ? 'PURCHASE' : 'EXCHANGE');
  const [hasEmpty, setHasEmpty] = useState(false);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Offer>(`/products/${id}`).then(setOffer).catch((e) => setLoadError(errorText(e)));
  }, [id]);

  if (loadError) return <div className="stack"><Notice kind="error">{loadError}</Notice><Link href="/" className="btn btn-quiet">Retour à la recherche</Link></div>;
  if (!offer) return <Loading />;

  const store = offer.store;
  const stock = offer.inventory?.quantity ?? 0;
  const maxQty = Math.min(stock, 10);
  const unit = kind === 'EXCHANGE' ? offer.exchangePrice : offer.purchasePrice;
  const name = `${offer.brand.name} ${offer.cylinderType.label}`;
  const low = stock <= 3;
  const notClient = !!user && user.role !== 'CLIENT';
  const canAdd = offer.available !== false && maxQty > 0 && (kind === 'PURCHASE' || hasEmpty) && !notClient;

  function addToCart(): boolean {
    if (!offer) return false;
    setError(null);
    const problem = cart.add({
      productId: offer.id, kind, quantity: qty, unitPrice: unit, maxQty,
      brandId: offer.brandId, brandName: offer.brand.name,
      cylinderTypeId: offer.cylinderTypeId, label: offer.cylinderType.label, capacityKg: offer.cylinderType.capacityKg,
      storeId: offer.store.id, storeName: offer.store.name,
    });
    if (problem) { setError(problem); return false; }
    setAdded(true);
    return true;
  }

  const modes = [
    store.offersDelivery && `Livraison${store.deliveryFee > 0 ? ` (${fcfa(store.deliveryFee)})` : ' gratuite'}`,
    store.offersPickup && 'Retrait au dépôt',
  ].filter(Boolean).join(' · ');

  return (
    <div className="stack-lg">
      <div className="product-hero">
        <Link href="/" className="back" aria-label="Retour aux dépôts"><Icon name="back" size={20} /></Link>
        {IMAGES.productHero && <img src={IMAGES.productHero} alt="" />}
        <span style={{ position: 'relative', marginBottom: 36 }}>
          <Cylinder photo={productPhoto(offer)} brand={offer.brand.name} kg={offer.cylinderType.capacityKg} color={brandColor(offer.brand.name)} scale={offer.cylinderType.capacityKg >= 12 ? 1.9 : 2.3} />
        </span>
      </div>

      <section className="card product-card stack">
        <div className="stack-sm">
          <h1 style={{ fontSize: '1.5rem' }}>{name}</h1>
          <p className="meta"><span><Icon name="store" size={15} />Livré par <strong style={{ color: 'var(--ink)' }}>{store.name}</strong></span></p>
          <p className="meta">
            <span><Icon name="pin" size={15} />{store.address}</span>
            <span><Icon name="clock" size={15} />{store.opensAt} à {store.closesAt}</span>
          </p>
        </div>

        <div className="choice-grid" role="radiogroup" aria-label="Achat ou échange">
          <button className="choice" role="radio" aria-checked={kind === 'PURCHASE'} onClick={() => { setKind('PURCHASE'); setAdded(false); }}>
            <span className="choice-label">Achat simple</span>
            <span className="choice-value num">{fcfa(offer.purchasePrice)}</span>
          </button>
          <button className="choice" role="radio" aria-checked={kind === 'EXCHANGE'} onClick={() => { setKind('EXCHANGE'); setAdded(false); }}>
            <span className="choice-label">Échange</span>
            <span className="choice-value num">{fcfa(offer.exchangePrice)}</span>
          </button>
        </div>

        {kind === 'EXCHANGE' && (
          <label className="panel panel-flag check-row">
            <input type="checkbox" checked={hasEmpty} onChange={(e) => setHasEmpty(e.target.checked)} />
            <span>
              J’ai une bouteille vide <strong>{name}</strong> à remettre.
              <span className="small muted" style={{ display: 'block' }}>L’échange est refusé si la marque ou la taille est différente.</span>
            </span>
          </label>
        )}

        <div className="split">
          <span className={`stock-dot${low ? ' low' : ''}`}>{offer.available === false ? 'Indisponible' : low ? `Plus que ${stock} en stock` : 'Stock disponible'}</span>
          <a className="link-more" href={`tel:${store.phone}`}><Icon name="phone" size={16} />{phoneFmt(store.phone)}</a>
        </div>
        <p className="meta"><span><Icon name="truck" size={15} />{modes}</span></p>
      </section>

      {offer.available === false && <Notice kind="error">Ce dépôt est fermé ou n’a plus de stock pour le moment.</Notice>}
      {notClient && <Notice>Seuls les comptes clients peuvent commander.</Notice>}
      {kind === 'EXCHANGE' && !hasEmpty && <p className="small muted">Cochez la case de l’échange pour confirmer que vous avez une bouteille vide à remettre.</p>}
      {error && <Notice kind="error">{error}</Notice>}
      {added && (
        <div className="panel panel-ok split" role="status">
          <span><strong>Ajouté au panier.</strong> Vous pouvez ajouter des bouteilles d’autres dépôts.</span>
          <Link className="link-more" href="/">Continuer mes achats</Link>
        </div>
      )}

      <button className="btn btn-quiet btn-block" disabled={!canAdd} onClick={() => { if (addToCart()) router.push('/panier'); }}>
        Commander maintenant
      </button>

      <div className="sticky-cta">
        <span className="stepper">
          <button aria-label="Une bouteille de moins" onClick={() => { setQty((q) => Math.max(1, q - 1)); setAdded(false); }}>−</button>
          <output aria-live="polite">{qty}</output>
          <button aria-label="Une bouteille de plus" onClick={() => { setQty((q) => Math.min(Math.max(maxQty, 1), q + 1)); setAdded(false); }}>+</button>
        </span>
        {added ? (
          <Link className="btn" href="/panier"><Icon name="cart" size={20} />Voir le panier ({cart.count})</Link>
        ) : (
          <button className="btn" disabled={!canAdd} onClick={addToCart}>Ajouter · {fcfa(unit * qty)}</button>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense><ProductPage /></Suspense>;
}
