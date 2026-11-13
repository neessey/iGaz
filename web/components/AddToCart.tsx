'use client';
import { useState } from 'react';
import { useCart } from '@/lib/cart';
import { fcfa } from '@/lib/format';
import { brandColor } from '@/lib/media';
import { Offer } from '@/lib/types';
import { Cylinder } from './Cylinder';
import { Sheet } from './Sheet';
import { Notice } from './ui';

/** Volet d'ajout au panier : achat ou échange (bouteille vide de même marque et taille), quantité. */
export function AddToCartSheet({ offer, onClose, onAdded }: { offer: Offer; onClose: () => void; onAdded: (text: string) => void }) {
  const cart = useCart();
  const [kind, setKind] = useState<'PURCHASE' | 'EXCHANGE'>('EXCHANGE');
  const [hasEmpty, setHasEmpty] = useState(false);
  const [qty, setQty] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const name = `${offer.brand.name} ${offer.cylinderType.label}`;
  const stock = offer.inventory?.quantity ?? 0;
  const maxQty = Math.min(stock, 10);
  const unit = kind === 'EXCHANGE' ? offer.exchangePrice : offer.purchasePrice;
  const can = maxQty > 0 && (kind === 'PURCHASE' || hasEmpty);

  function add() {
    const problem = cart.add({
      productId: offer.id, kind, quantity: qty, unitPrice: unit, maxQty,
      brandId: offer.brandId, brandName: offer.brand.name,
      cylinderTypeId: offer.cylinderTypeId, label: offer.cylinderType.label, capacityKg: offer.cylinderType.capacityKg,
      storeId: offer.store.id, storeName: offer.store.name,
    });
    if (problem) { setError(problem); return; }
    onAdded(`${qty} × ${name} ajouté${qty > 1 ? 's' : ''} au panier`);
    onClose();
  }

  return (
    <Sheet title={`Ajouter ${name}`} onClose={onClose}>
      <div className="cluster" style={{ flexWrap: 'nowrap', gap: 14 }}>
        <span className="offer-media" style={{ width: 72, height: 72 }}>
          <Cylinder brand={offer.brand.name} kg={offer.cylinderType.capacityKg} color={brandColor(offer.brand.name)} scale={offer.cylinderType.capacityKg >= 12 ? 0.62 : 0.78} />
        </span>
        <span>
          <strong style={{ display: 'block', fontSize: '1.15rem' }}>{name}</strong>
          <span className="small muted">{offer.cylinderType.capacityKg} kg · {stock <= 3 ? `plus que ${stock} en stock` : 'en stock'}</span>
        </span>
      </div>

      <div className="choice-grid" role="radiogroup" aria-label="Achat ou échange">
        <button className="choice" role="radio" aria-checked={kind === 'EXCHANGE'} onClick={() => setKind('EXCHANGE')}>
          <span className="choice-label">Échange</span>
          <span className="choice-value num">{fcfa(offer.exchangePrice)}</span>
        </button>
        <button className="choice" role="radio" aria-checked={kind === 'PURCHASE'} onClick={() => setKind('PURCHASE')}>
          <span className="choice-label">Achat simple</span>
          <span className="choice-value num">{fcfa(offer.purchasePrice)}</span>
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

      {error && <Notice kind="error">{error}</Notice>}

      <div className="cluster" style={{ flexWrap: 'nowrap' }}>
        <span className="stepper">
          <button aria-label="Une bouteille de moins" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
          <output aria-live="polite">{qty}</output>
          <button aria-label="Une bouteille de plus" disabled={qty >= maxQty} onClick={() => setQty((q) => Math.min(maxQty, q + 1))}>+</button>
        </span>
        <button className="btn" style={{ flex: 1, whiteSpace: 'nowrap' }} disabled={!can} onClick={add}>Ajouter · {fcfa(unit * qty)}</button>
      </div>
      {kind === 'EXCHANGE' && !hasEmpty && <p className="small muted">Cochez la case pour confirmer que vous avez la bouteille vide.</p>}
    </Sheet>
  );
}
