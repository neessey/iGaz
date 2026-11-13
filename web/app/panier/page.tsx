'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Cylinder } from '@/components/Cylinder';
import { Icon } from '@/components/Icon';
import { Empty, Loading, Notice, PageHead } from '@/components/ui';
import { MAX_STORES, useCart } from '@/lib/cart';
import { fcfa } from '@/lib/format';
import { brandColor } from '@/lib/media';

export default function CartPage() {
  const cart = useCart();
  // « Commander à nouveau » : bouteilles de l'ancienne commande qui ne sont plus disponibles.
  const [missing, setMissing] = useState<string | null>(null);
  useEffect(() => { setMissing(new URLSearchParams(window.location.search).get('indisponible')); }, []);

  if (!cart.ready) return <Loading />;

  if (cart.lines.length === 0) {
    return (
      <div className="stack-lg">
        <PageHead title="Mon panier" />
        <Empty title="Votre panier est vide">Ajoutez des bouteilles depuis un ou plusieurs dépôts (jusqu’à {MAX_STORES}), puis validez en une fois.</Empty>
        <Link href="/" className="btn btn-block">Trouver du gaz</Link>
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <PageHead title="Mon panier" />
      {missing && <Notice>Plus disponible pour le moment, non ajouté : {missing}.</Notice>}

      {cart.groups.map((g) => (
        <section key={g.storeId} className="card stack" aria-label={`Articles de ${g.storeName}`}>
          <div className="split" style={{ flexWrap: 'nowrap' }}>
            <span className="cluster" style={{ gap: 8, flexWrap: 'nowrap', fontWeight: 800 }}><Icon name="store" size={20} />{g.storeName}</span>
            <button className="link-more" style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--red)' }} onClick={() => cart.removeStore(g.storeId)}>
              Retirer ce dépôt
            </button>
          </div>
          <div className="rows-flat">
            {g.lines.map((l) => (
              <div key={`${l.productId}-${l.kind}`} className="cart-line">
                <span className="offer-media" style={{ width: 64, height: 64 }}>
                  <Cylinder photo={l.photo} brand={l.brandName} kg={l.capacityKg} color={brandColor(l.brandName)} scale={l.capacityKg >= 12 ? 0.55 : 0.65} />
                </span>
                <span className="stack-sm" style={{ minWidth: 0 }}>
                  <strong style={{ display: 'block' }}>{l.brandName} {l.label}</strong>
                  <span className="small muted">{l.kind === 'EXCHANGE' ? 'Échange' : 'Achat simple'}</span>
                  <span className="num price" style={{ display: 'block' }}>{fcfa(l.unitPrice)}</span>
                </span>
                <span className="stack-sm" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <button className="icon-btn" style={{ background: 'var(--red-soft)', color: 'var(--red)' }}
                    aria-label={`Retirer ${l.brandName} ${l.label}`} onClick={() => cart.remove(l.productId, l.kind)}>
                    <Icon name="trash" size={18} />
                  </button>
                  <span className="stepper">
                    <button aria-label="Une bouteille de moins" onClick={() => cart.setQuantity(l.productId, l.kind, l.quantity - 1)}>−</button>
                    <output aria-live="polite">{l.quantity}</output>
                    <button aria-label="Une bouteille de plus" disabled={l.quantity >= l.maxQty} onClick={() => cart.setQuantity(l.productId, l.kind, l.quantity + 1)}>+</button>
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="card stack-sm" aria-label="Total">
        <dl className="facts">
          <dt>Sous-total ({cart.count} bouteille{cart.count > 1 ? 's' : ''})</dt><dd className="num">{fcfa(cart.subtotal)}</dd>
          <dt>Livraison</dt><dd>À l’étape suivante</dd>
          <dt className="total">Total des bouteilles</dt><dd className="total num price">{fcfa(cart.subtotal)}</dd>
        </dl>
        {cart.groups.length > 1 && (
          <p className="small muted">
            {cart.groups.length} dépôts : vous recevrez une commande par dépôt, chacune avec son propre code de remise.
            Vous payez le tout en une fois.
          </p>
        )}
      </section>

      <div className="sticky-cta">
        <Link className="btn" href="/panier/valider">Passer la commande</Link>
      </div>
      <Link href="/" className="btn btn-quiet btn-block">Continuer mes achats</Link>
    </div>
  );
}
