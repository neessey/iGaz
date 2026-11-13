'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Cylinder } from '@/components/Cylinder';
import { Icon } from '@/components/Icon';
import { Bell } from '@/components/Bell';
import { StoreCard } from '@/components/StoreCard';
import { Empty, Loading, Notice, SectionHead } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { IMAGES } from '@/lib/media';
import { useSession } from '@/lib/session';
import { groupByStore } from '@/lib/stores';
import { Cylinder as CylinderType, Offer, Zone } from '@/lib/types';

const ZONE_KEY = 'igaz.zone';

export default function Home() {
  const { user } = useSession();
  const [zones, setZones] = useState<Zone[]>([]);
  const [cylinders, setCylinders] = useState<CylinderType[]>([]);
  const [zoneId, setZoneId] = useState('');
  const [cylinderId, setCylinderId] = useState('');
  const [query, setQuery] = useState('');
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<Zone[]>('/catalog/zones'), api<CylinderType[]>('/catalog/cylinder-types'),
    ]).then(([z, c]) => {
      setZones(z); setCylinders(c);
      try {
        const saved = localStorage.getItem(ZONE_KEY);
        if (saved && z.some((x) => x.id === saved)) setZoneId(saved);
      } catch { /* sans stockage, la commune est simplement à rechoisir */ }
    }).catch((e) => setError(errorText(e)));
  }, []);

  // Pas de choix livraison / retrait ici : il se fait par dépôt à la validation du panier. Une commune choisie
  // ne garde que les dépôts qui la livrent ; sans commune, tous les dépôts ouverts sont affichés.
  useEffect(() => {
    const q = new URLSearchParams();
    if (zoneId) q.set('zoneId', zoneId);
    if (cylinderId) q.set('cylinderTypeId', cylinderId);
    let live = true;
    setOffers(null);
    api<Offer[]>(`/products?${q}`).then((o) => live && setOffers(o)).catch((e) => live && setError(errorText(e)));
    return () => { live = false; };
  }, [zoneId, cylinderId]);

  function pickZone(id: string) {
    setZoneId(id);
    try { localStorage.setItem(ZONE_KEY, id); } catch { /* ignoré */ }
  }

  const zoneName = zones.find((z) => z.id === zoneId)?.name;
  const stores = useMemo(() => {
    if (!offers) return null;
    const q = query.trim().toLowerCase();
    const matching = q
      ? offers.filter((o) => [o.brand.name, o.cylinderType.label, o.store.name, o.store.address].some((s) => s.toLowerCase().includes(q)))
      : offers;
    // Prix affiché : la recharge (échange d'une bouteille vide), l'achat le plus courant.
    return groupByStore(matching, true);
  }, [offers, query]);

  const storeHref = (id: string) => `/depot/${id}`;

  return (
    <div className="stack-lg wide">
      <div className="deliver-bar">
        <div className="split" style={{ flexWrap: 'nowrap' }}>
          <div className="deliver-to">
            <span className="pin"><Icon name="pin" size={20} /></span>
            <label>
              <span className="over">Livrer à</span>
              <select value={zoneId} onChange={(e) => pickZone(e.target.value)} aria-label="Votre commune">
                <option value="">Toutes les communes</option>
                {zones.map((z) => <option key={z.id} value={z.id}>{z.name}, {z.city}</option>)}
              </select>
            </label>
          </div>
          {user ? <Bell /> :<Link className="btn btn-quiet btn-small" style={{ whiteSpace: 'nowrap', flex: 'none' }} href="/connexion">Se connecter</Link>}
        </div>
        <div className="search">
          <Icon name="search" size={20} />
          <input className="input" type="search" placeholder="Dépôt, marque, taille (B6…)"
            aria-label="Rechercher un dépôt, une marque ou une taille" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>


      <section className="promo night" aria-label="Commander du gaz">
        {IMAGES.promo && <img className="promo-photo" src={IMAGES.promo} alt="" />}
        <h2>Votre gaz à portée de main&nbsp;!</h2>
        <a className="btn" href="#depots">Voir les dépôts <Icon name="chevron" size={18} /></a>
        {!IMAGES.promo && (
          <span className="promo-art" aria-hidden="true">
            <Cylinder kg={12} brand="Pétro Ivoire" color="#1d4ed8" scale={1.25} />
          </span>
        )}
      </section>

      <div className="hscroll sizes" role="radiogroup" aria-label="Taille de la bouteille">
        <button className="chip" role="radio" aria-checked={cylinderId === ''} onClick={() => setCylinderId('')}>Tout</button>
        {cylinders.map((c) => (
          <button key={c.id} className="chip" role="radio" aria-checked={cylinderId === c.id} onClick={() => setCylinderId(c.id)}>
            {c.label}
          </button>
        ))}
      </div>

      {error && <Notice kind="error">{error}</Notice>}

      <section id="depots" aria-live="polite" className="stack-sm" style={{ scrollMarginTop: 130 }}>
        <SectionHead title={zoneName ? `Ils livrent à ${zoneName}` : 'Dépôts d’Abidjan'} />
        {stores === null ? (
          <Loading>Recherche des dépôts…</Loading>
        ) : stores.length === 0 ? (
          <Empty title={query ? 'Aucun résultat' : zoneName ? `Aucun dépôt ne livre à ${zoneName} pour l’instant` : 'Aucun dépôt disponible'}>
            {query ? 'Essayez un autre mot.' : zoneName ? 'Choisissez « Toutes les communes » en haut pour voir les dépôts où retirer votre bouteille.' : 'Essayez une autre taille ou une autre marque.'}
          </Empty>
        ) : (
          <div className="store-grid">
            {stores.map((s) => <StoreCard key={s.store.id} summary={s} href={storeHref(s.store.id)} />)}
          </div>
        )}
      </section>

      <Link href="/fournisseur/inscription" className="card card-link split" style={{ display: 'flex', flexWrap: 'nowrap' }}>
        <span className="cluster" style={{ flexWrap: 'nowrap', flex: 1, minWidth: 0 }}>
          <span className="brand-mark" style={{ background: 'var(--night-2)', flex: 'none' }}><Icon name="store" size={20} /></span>
          <span><strong>Vous vendez du gaz&nbsp;?</strong><span className="small muted" style={{ display: 'block' }}>Ouvrez votre boutique sur iGaz</span></span>
        </span>
        <Icon name="chevron" size={20} />
      </Link>
    </div>
  );
}
