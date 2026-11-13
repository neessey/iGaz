'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Cylinder } from '@/components/Cylinder';
import { Empty, Loading, Notice } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { fcfa } from '@/lib/format';
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

  return (
    <div className="stack-lg">
      <div className="stack-sm">
        <h1>Quelle bouteille vous faut-il&nbsp;?</h1>
        <p className="muted">Choisissez la taille, votre commune, et voyez les dépôts qui ont du stock maintenant.</p>
      </div>

      <section className="stack-sm" aria-labelledby="taille">
        <h2 id="taille" className="small" style={{ fontFamily: 'var(--font-body)', fontWeight: 700 }}>Taille de la bouteille</h2>
        <div className="cyl-picker" role="radiogroup" aria-labelledby="taille">
          <button className="cyl-opt" role="radio" aria-checked={cylinderId === ''} onClick={() => setCylinderId('')}>
            <span className="cyl-name">Toutes</span>
            <span className="cyl-kg">les tailles</span>
          </button>
          {cylinders.map((c) => (
            <button key={c.id} className="cyl-opt" role="radio" aria-checked={cylinderId === c.id} onClick={() => setCylinderId(c.id)}>
              <Cylinder kg={c.capacityKg} />
              <span className="cyl-name">{c.label}</span>
              <span className="cyl-kg">{c.capacityKg}&nbsp;kg</span>
            </button>
          ))}
        </div>
      </section>

      <section className="stack-sm" aria-labelledby="mode">
        <h2 id="mode" className="small" style={{ fontFamily: 'var(--font-body)', fontWeight: 700 }}>Comment la recevoir</h2>
        <div className="segmented" role="radiogroup" aria-labelledby="mode" style={{ maxWidth: 420 }}>
          <button role="radio" aria-checked={mode === 'DELIVERY'} onClick={() => setMode('DELIVERY')}>Livraison chez moi</button>
          <button role="radio" aria-checked={mode === 'PICKUP'} onClick={() => setMode('PICKUP')}>Retrait au dépôt</button>
        </div>
      </section>

      <section className="stack-sm" aria-labelledby="commune">
        <h2 id="commune" className="small" style={{ fontFamily: 'var(--font-body)', fontWeight: 700 }}>
          {mode === 'DELIVERY' ? 'Votre commune' : 'Commune du dépôt (facultatif)'}
        </h2>
        <div className="chips" role="group" aria-labelledby="commune">
          {zones.map((z) => (
            <button key={z.id} className="chip" aria-pressed={zoneId === z.id} onClick={() => pickZone(z.id)}>{z.name}</button>
          ))}
        </div>
        {brands.length > 1 && (
          <select className="input" aria-label="Marque" value={brandId} onChange={(e) => setBrandId(e.target.value)} style={{ maxWidth: 320, marginTop: 14 }}>
            <option value="">Toutes les marques</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
      </section>

      {error && <Notice kind="error">{error}</Notice>}

      <section aria-live="polite" className="stack-sm">
        {needsZone ? (
          <Empty title="Choisissez votre commune">Nous affichons ensuite les dépôts qui livrent chez vous.</Empty>
        ) : offers === null ? (
          <Loading>Recherche des dépôts…</Loading>
        ) : offers.length === 0 ? (
          <Empty title={zoneName && mode === 'DELIVERY' ? `Aucun dépôt ne livre à ${zoneName} pour l’instant` : 'Aucune bouteille disponible'}>
            Essayez une autre taille ou une autre commune, ou passez en retrait au dépôt.
          </Empty>
        ) : (
          <div className="rows">
            {offers.map((o) => {
              const qty = o.inventory?.quantity ?? 0;
              return (
                <Link key={o.id} href={`/produit/${o.id}?mode=${mode}`} className="offer">
                  <span className="cyl-slot"><Cylinder kg={o.cylinderType.capacityKg} /></span>
                  <span className="stack-sm" style={{ minWidth: 0 }}>
                    <span className="offer-title">{o.brand.name} {o.cylinderType.label}</span>
                    <span className="small" style={{ display: 'block' }}>{o.store.name}, {o.store.address}</span>
                    <span className="small muted" style={{ display: 'block' }}>
                      {mode === 'DELIVERY'
                        ? (o.store.deliveryFee > 0 ? `Livraison ${fcfa(o.store.deliveryFee)}` : 'Livraison gratuite')
                        : 'Retrait sur place'}
                      {' — '}
                      {qty <= 3 ? <strong style={{ color: 'var(--rust)' }}>plus que {qty}</strong> : `${qty} en stock`}
                    </span>
                  </span>
                  <span className="offer-price">
                    <span className="num big">{fcfa(o.purchasePrice)}</span>
                    <span className="small muted" style={{ display: 'block' }}>échange {fcfa(o.exchangePrice)}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <p className="small muted">
        Vous vendez du gaz&nbsp;? <Link href="/fournisseur/inscription">Ouvrez votre boutique sur iGaz</Link>.
      </p>
    </div>
  );
}
