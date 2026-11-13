'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Cylinder } from '@/components/Cylinder';
import { Icon } from '@/components/Icon';
import { Empty, Loading, Notice, SectionHead } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { fcfa } from '@/lib/format';
import { brandColor, brandLogo, IMAGES, initials, STORE_PHOTOS } from '@/lib/media';
import { Brand, Cylinder as CylinderType, Offer, Zone } from '@/lib/types';

type Mode = 'DELIVERY' | 'PICKUP';
const ZONE_KEY = 'igaz.zone';

export default function Home() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [cylinders, setCylinders] = useState<CylinderType[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [zoneId, setZoneId] = useState('');
  const [cylinderId, setCylinderId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [mode, setMode] = useState<Mode>('DELIVERY');
  const [exchange, setExchange] = useState(false);
  const [query, setQuery] = useState('');
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<Zone[]>('/catalog/zones'), api<CylinderType[]>('/catalog/cylinder-types'), api<Brand[]>('/catalog/brands'),
    ]).then(([z, c, b]) => {
      setZones(z); setCylinders(c); setBrands(b);
      try {
        const saved = localStorage.getItem(ZONE_KEY);
        if (saved && z.some((x) => x.id === saved)) setZoneId(saved);
      } catch { /* sans stockage, la commune est simplement à rechoisir */ }
    }).catch((e) => setError(errorText(e)));
  }, []);

  const needsZone = mode === 'DELIVERY' && !zoneId;

  useEffect(() => {
    if (needsZone) { setOffers(null); return; }
    const q = new URLSearchParams({ fulfillment: mode });
    if (zoneId) q.set('zoneId', zoneId);
    if (cylinderId) q.set('cylinderTypeId', cylinderId);
    if (brandId) q.set('brandId', brandId);
    let live = true;
    setOffers(null);
    api<Offer[]>(`/products?${q}`).then((o) => live && setOffers(o)).catch((e) => live && setError(errorText(e)));
    return () => { live = false; };
  }, [needsZone, mode, zoneId, cylinderId, brandId]);

  function pickZone(id: string) {
    setZoneId(id);
    try { localStorage.setItem(ZONE_KEY, id); } catch { /* ignoré */ }
  }

  const zoneName = zones.find((z) => z.id === zoneId)?.name;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!offers || !q) return offers;
    return offers.filter((o) =>
      [o.brand.name, o.cylinderType.label, o.store.name, o.store.address].some((s) => s.toLowerCase().includes(q)));
  }, [offers, query]);

  return (
    <div className="stack-lg">
      <div className="stack">
        <label className="cluster" style={{ gap: 6, fontWeight: 700 }}>
          <Icon name="pin" size={20} />
          <span className="visually-hidden">Votre commune</span>
          <select value={zoneId} onChange={(e) => pickZone(e.target.value)}
            style={{ border: 0, background: 'transparent', fontWeight: 700, fontSize: '1.05rem', minHeight: 44, cursor: 'pointer', paddingRight: 4 }}>
            <option value="">{mode === 'DELIVERY' ? 'Choisir ma commune' : 'Toutes les communes'}</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name}, {z.city}</option>)}
          </select>
        </label>
        <div className="search">
          <Icon name="search" size={20} />
          <input className="input" type="search" placeholder="Rechercher une bouteille, une marque, un dépôt…"
            aria-label="Rechercher" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <section className="promo night" aria-label="Commander du gaz">
        {IMAGES.promo && <img className="promo-photo" src={IMAGES.promo} alt="" />}
        <h2>Votre gaz à portée de main&nbsp;!</h2>
        <a className="btn" href="#depots">Commander maintenant <Icon name="chevron" size={18} /></a>
        {!IMAGES.promo && (
          <span className="promo-art" aria-hidden="true">
            <Cylinder kg={12} color="#1d4ed8" scale={1.25} />
          </span>
        )}
      </section>

      <div className="quick" role="group" aria-label="Comment recevoir votre gaz">
        <button aria-pressed={mode === 'DELIVERY'} onClick={() => setMode('DELIVERY')}>
          <span className="bubble"><Icon name="truck" /></span>Livraison
        </button>
        <button aria-pressed={mode === 'PICKUP'} onClick={() => setMode('PICKUP')}>
          <span className="bubble"><Icon name="store" /></span>Retrait
        </button>
        <button aria-pressed={exchange} onClick={() => setExchange((v) => !v)}>
          <span className="bubble"><Icon name="swap" /></span>Échange
        </button>
        <Link href="/commandes">
          <span className="bubble"><Icon name="orders" /></span>Commandes
        </Link>
      </div>

      <section className="stack-sm" aria-labelledby="taille">
        <h2 id="taille">Taille de la bouteille</h2>
        <div className="cyl-picker" role="radiogroup" aria-labelledby="taille">
          <button className="cyl-opt" role="radio" aria-checked={cylinderId === ''} onClick={() => setCylinderId('')}>
            <span className="cyl-name">Toutes</span>
            <span className="cyl-kg">les tailles</span>
          </button>
          {cylinders.map((c) => (
            <button key={c.id} className="cyl-opt" role="radio" aria-checked={cylinderId === c.id} onClick={() => setCylinderId(c.id)}>
              <Cylinder kg={c.capacityKg} color={cylinderId === c.id ? '#e05a12' : '#8b84b0'} />
              <span className="cyl-name">{c.label}</span>
              <span className="cyl-kg">{c.capacityKg}&nbsp;kg</span>
            </button>
          ))}
        </div>
      </section>

      {brands.length > 0 && (
        <section className="stack-sm" aria-labelledby="marques">
          <h2 id="marques">Nos marques</h2>
          <div className="brands" role="group" aria-labelledby="marques">
            <button className="brand-tile" aria-pressed={brandId === ''} onClick={() => setBrandId('')}>
              <span className="brand-mark" style={{ background: 'var(--violet)' }}><Icon name="grid" size={20} /></span>
              Toutes
            </button>
            {brands.map((b) => {
              const logo = brandLogo(b.name);
              return (
                <button key={b.id} className="brand-tile" aria-pressed={brandId === b.id} onClick={() => setBrandId(brandId === b.id ? '' : b.id)}>
                  {logo ? <img src={logo} alt="" /> : <span className="brand-mark" style={{ background: brandColor(b.name) }}>{initials(b.name)}</span>}
                  {b.name}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {error && <Notice kind="error">{error}</Notice>}

      <section id="depots" aria-live="polite" className="stack-sm" style={{ scrollMarginTop: 16 }}>
        <SectionHead title={mode === 'DELIVERY' ? (zoneName ? `Livré à ${zoneName}` : 'À proximité') : 'Retrait au dépôt'} />
        {needsZone ? (
          <Empty title="Choisissez votre commune">Touchez « Choisir ma commune » en haut de la page : nous affichons ensuite les dépôts qui livrent chez vous.</Empty>
        ) : shown === null ? (
          <Loading>Recherche des dépôts…</Loading>
        ) : shown.length === 0 ? (
          <Empty title={query ? 'Aucun résultat' : zoneName && mode === 'DELIVERY' ? `Aucun dépôt ne livre à ${zoneName} pour l’instant` : 'Aucune bouteille disponible'}>
            {query ? 'Essayez un autre mot.' : 'Essayez une autre taille ou une autre commune, ou passez en retrait au dépôt.'}
          </Empty>
        ) : (
          <div className="rows">
            {shown.map((o) => {
              const qty = o.inventory?.quantity ?? 0;
              const photo = STORE_PHOTOS[o.store.id];
              const price = exchange ? o.exchangePrice : o.purchasePrice;
              return (
                <Link key={o.id} href={`/produit/${o.id}?mode=${mode}&kind=${exchange ? 'EXCHANGE' : 'PURCHASE'}`} className="card offer">
                  <span className="offer-media">
                    {photo ? <img src={photo} alt="" /> : <Cylinder kg={o.cylinderType.capacityKg} color={brandColor(o.brand.name)} scale={o.cylinderType.capacityKg >= 12 ? 0.65 : 0.8} />}
                  </span>
                  <span className="stack-sm" style={{ minWidth: 0 }}>
                    <span className="offer-title" style={{ display: 'block' }}>{o.brand.name} {o.cylinderType.label}</span>
                    <span className="meta">
                      <span><Icon name="store" size={14} />{o.store.name}</span>
                    </span>
                    <span className="meta">
                      <span>{mode === 'DELIVERY'
                        ? (o.store.deliveryFee > 0 ? `Livraison ${fcfa(o.store.deliveryFee)}` : 'Livraison gratuite')
                        : o.store.address}</span>
                      <span className={`stock-dot${qty <= 3 ? ' low' : ''}`} style={{ fontSize: '0.8rem' }}>
                        {qty <= 3 ? `Plus que ${qty}` : 'En stock'}
                      </span>
                    </span>
                  </span>
                  <span className="offer-price">
                    <span className="num big price">{fcfa(price)}</span>
                    <span className="small muted">{exchange ? 'échange' : 'achat'}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <Link href="/fournisseur/inscription" className="card card-link split" style={{ flexWrap: 'nowrap' }}>
        <span className="cluster" style={{ flexWrap: 'nowrap' }}>
          <span className="brand-mark" style={{ background: 'var(--night-2)' }}><Icon name="store" size={20} /></span>
          <span><strong>Vous vendez du gaz&nbsp;?</strong><span className="small muted" style={{ display: 'block' }}>Ouvrez votre boutique sur iGaz</span></span>
        </span>
        <Icon name="chevron" size={20} />
      </Link>
    </div>
  );
}
