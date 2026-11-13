'use client';
import Link from 'next/link';
import { useCart } from '@/lib/cart';
import { fcfa } from '@/lib/format';
import { Icon } from './Icon';

/** Barre « Voir le panier » flottante, au-dessus des onglets, sur les pages où l'on fait ses achats. */
export function CartBar() {
  const cart = useCart();
  if (!cart.ready || cart.count === 0) return null;
  const stores = cart.groups.length;
  return (
    <>
      <div className="cart-bar-space" aria-hidden="true" />
      <div className="cart-bar">
        <Link href="/panier" aria-label={`Voir le panier : ${cart.count} bouteille${cart.count > 1 ? 's' : ''}, ${fcfa(cart.subtotal)}`}>
          <span className="count"><Icon name="cart" size={18} />{cart.count}</span>
          <span>Voir le panier{stores > 1 ? <span className="hide-narrow" style={{ fontWeight: 600, opacity: 0.9 }}> · {stores} dépôts</span> : null}</span>
          <span className="num">{fcfa(cart.subtotal)}</span>
        </Link>
      </div>
    </>
  );
}
