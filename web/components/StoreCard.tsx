import Link from 'next/link';
import { ReactNode } from 'react';
import { fcfa } from '@/lib/format';
import { brandColor, productPhoto, STORE_PHOTOS } from '@/lib/media';
import { closesSoon, StoreSummary } from '@/lib/stores';
import { Cylinder } from './Cylinder';
import { Icon } from './Icon';

/** Couverture d'un dépôt : sa photo si elle est fournie, sinon les bouteilles de ses marques sur fond violet nuit. */
export function StoreCover({ summary, children, className = '' }: { summary: StoreSummary; children?: ReactNode; className?: string }) {
  const photo = STORE_PHOTOS[summary.store.id];
  const bottles = summary.offers
    .filter((o, i, all) => all.findIndex((x) => x.brand.id === o.brand.id && x.cylinderType.id === o.cylinderType.id) === i)
    .sort((a, b) => a.cylinderType.capacityKg - b.cylinderType.capacityKg)
    .slice(0, 4);
  return (
    <div className={`store-cover ${className}`}>
      {photo
        ? <img className="photo" src={photo} alt="" />
        : bottles.map((o) => <Cylinder key={o.id} photo={productPhoto(o)} brand={o.brand.name} kg={o.cylinderType.capacityKg} color={brandColor(o.brand.name)} scale={0.62} />)}
      {children}
    </div>
  );
}

export function StoreCard({ summary, href }: { summary: StoreSummary; href: string }) {
  const { store } = summary;
  const soon = closesSoon(store.opensAt, store.closesAt);
  return (
    <Link href={href} className="store-card">
      <StoreCover summary={summary}>
        <span className="tag">
          <Icon name={store.offersDelivery ? 'truck' : 'store'} size={14} />
          {store.offersDelivery ? (store.deliveryFee > 0 ? `Livraison ${fcfa(store.deliveryFee)}` : 'Livraison gratuite') : 'Retrait seulement'}
        </span>
        <span className={`tag right${soon ? ' closing' : ''}`}>
          <Icon name="clock" size={14} />{soon ? `Ferme à ${store.closesAt}` : `Jusqu’à ${store.closesAt}`}
        </span>
      </StoreCover>
      <div className="store-body">
        <span className="store-name">{store.name}</span>
        <span className="meta">
          <span>{summary.sizes.join(' · ')}</span>
          <span>{summary.brands.map((b) => b.name).join(', ')}</span>
        </span>
        <span className="meta">
          <span><Icon name="pin" size={14} />{store.address}</span>
          {store.offersDelivery && store.offersPickup && <span><Icon name="store" size={14} />Retrait possible</span>}
        </span>
        <span className="small">Dès <strong className="price">{fcfa(summary.minPrice)}</strong></span>
      </div>
    </Link>
  );
}
