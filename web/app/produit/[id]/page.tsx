'use client';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { Cylinder } from '@/components/Cylinder';
import { Field, Loading, Notice } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { fcfa, phoneFmt } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Address, Offer, Zone } from '@/lib/types';

function OrderForm() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const params = useSearchParams();
  const { user, ready } = useSession();

  const [offer, setOffer] = useState<Offer | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [kind, setKind] = useState<'PURCHASE' | 'EXCHANGE'>('EXCHANGE');
  const [hasEmpty, setHasEmpty] = useState(false);
  const [qty, setQty] = useState(1);
  const [fulfillment, setFulfillment] = useState<'DELIVERY' | 'PICKUP'>(params.get('mode') === 'PICKUP' ? 'PICKUP' : 'DELIVERY');
  const [payment, setPayment] = useState<'MOBILE_MONEY' | 'CASH_ON_DELIVERY'>('MOBILE_MONEY');
  const [addressChoice, setAddressChoice] = useState('new');
  const [newZone, setNewZone] = useState('');
  const [newDetails, setNewDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Offer>(`/products/${id}`).then(setOffer).catch((e) => setLoadError(errorText(e)));
    api<Zone[]>('/catalog/zones').then(setZones).catch(() => undefined);
  }, [id]);

  useEffect(() => {
    if (user?.role === 'CLIENT') api<Address[]>('/addresses').then(setAddresses).catch(() => undefined);
  }, [user]);

  const store = offer?.store;
  const servedZones = useMemo(
    () => zones.filter((z) => store?.areas?.some((a) => a.zoneId === z.id)),
    [zones, store],
  );
  const usable = addresses.filter((a) => servedZones.some((z) => z.id === a.zoneId));

  useEffect(() => {
    if (!store) return;
    if (!store.offersDelivery) setFulfillment('PICKUP');
    else if (!store.offersPickup) setFulfillment('DELIVERY');
  }, [store]);

  useEffect(() => {
    setAddressChoice(usable[0]?.id ?? 'new');
    if (!newZone && servedZones[0]) setNewZone(servedZones[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addresses.length, servedZones.length]);

  if (loadError) return <div className="stack"><Notice kind="error">{loadError}</Notice><Link href="/" className="btn btn-quiet">Retour à la recherche</Link></div>;
  if (!offer || !store) return <Loading />;

  const stock = offer.inventory?.quantity ?? 0;
  const unit = kind === 'EXCHANGE' ? offer.exchangePrice : offer.purchasePrice;
  const fee = fulfillment === 'DELIVERY' ? store.deliveryFee : 0;
  const total = unit * qty + fee;
  const maxQty = Math.min(stock, 10);
  const canOrder = offer.available !== false && (kind === 'PURCHASE' || hasEmpty) &&
    (fulfillment === 'PICKUP' || addressChoice !== 'new' || newDetails.trim().length >= 3);

  async function submit() {
    if (!offer || !store) return;
    setBusy(true); setError(null);
    try {
      let addressId: string | undefined;
      if (fulfillment === 'DELIVERY') {
        if (addressChoice === 'new') {
          const a = await api<Address>('/addresses', { body: { zoneId: newZone, details: newDetails.trim() } });
          addressId = a.id;
        } else addressId = addressChoice;
      }
      const order = await api<{ id: string }>('/orders', {
        body: {
          storeId: store.id, fulfillment, paymentMethod: payment, addressId,
          items: [{
            productId: offer.id, kind, quantity: qty,
            ...(kind === 'EXCHANGE' ? { returnedBrandId: offer.brandId, returnedCylinderTypeId: offer.cylinderTypeId } : {}),
          }],
        },
      });
      router.push(`/commandes/${order.id}`);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  const name = `${offer.brand.name} ${offer.cylinderType.label}`;

  return (
    <div className="stack-lg">
      <Link href="/" className="small">Retour aux dépôts</Link>

      <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr', gap: 16, alignItems: 'center' }}>
        <span className="cyl-slot" style={{ height: 100, color: 'var(--enamel)' }}><Cylinder kg={offer.cylinderType.capacityKg} /></span>
        <div className="stack-sm">
          <h1>{name}</h1>
          <p>{store.name}, {store.address}</p>
          <p className="small muted">Ouvert de {store.opensAt} à {store.closesAt}. Tél. {phoneFmt(store.phone)}</p>
        </div>
      </div>

      {offer.available === false && <Notice kind="error">Ce dépôt est fermé ou n’a plus de stock pour le moment.</Notice>}

      {ready && !user && (
        <div className="panel panel-warn stack-sm">
          <h3>Connectez-vous pour commander</h3>
          <p className="muted">Un code par SMS suffit, sans mot de passe.</p>
          <Link className="btn" href={`/connexion?next=${encodeURIComponent(`/produit/${id}?mode=${fulfillment}`)}`}>Se connecter</Link>
        </div>
      )}
      {user && user.role !== 'CLIENT' && <Notice>Seuls les comptes clients peuvent commander.</Notice>}

      <section className="stack-sm" aria-labelledby="kind">
        <h2 id="kind" className="small" style={{ fontFamily: 'var(--font-body)', fontWeight: 700 }}>Votre commande</h2>
        <div className="segmented" role="radiogroup" aria-labelledby="kind">
          <button role="radio" aria-checked={kind === 'EXCHANGE'} onClick={() => setKind('EXCHANGE')}>
            J’échange ma vide<br /><span className="num">{fcfa(offer.exchangePrice)}</span>
          </button>
          <button role="radio" aria-checked={kind === 'PURCHASE'} onClick={() => setKind('PURCHASE')}>
            J’achète sans vide<br /><span className="num">{fcfa(offer.purchasePrice)}</span>
          </button>
        </div>
        {kind === 'EXCHANGE' && (
          <label className="panel panel-flag" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="checkbox" checked={hasEmpty} onChange={(e) => setHasEmpty(e.target.checked)} style={{ width: 26, height: 26, marginTop: 2, accentColor: '#0c6b58' }} />
            <span>
              J’ai une bouteille vide <strong>{name}</strong> à remettre.
              <span className="small muted" style={{ display: 'block' }}>
                L’échange est refusé si la marque ou la taille est différente.
              </span>
            </span>
          </label>
        )}
        <div className="cluster" style={{ marginTop: 6 }}>
          <span className="stepper">
            <button aria-label="Une bouteille de moins" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
            <output aria-live="polite">{qty}</output>
            <button aria-label="Une bouteille de plus" onClick={() => setQty((q) => Math.min(maxQty, q + 1))}>+</button>
          </span>
          <span className="small muted">{stock} en stock</span>
        </div>
      </section>

      <section className="stack-sm" aria-labelledby="mode">
        <h2 id="mode" className="small" style={{ fontFamily: 'var(--font-body)', fontWeight: 700 }}>Réception</h2>
        <div className="segmented" role="radiogroup" aria-labelledby="mode">
          <button role="radio" aria-checked={fulfillment === 'DELIVERY'} disabled={!store.offersDelivery} onClick={() => setFulfillment('DELIVERY')}>Livraison</button>
          <button role="radio" aria-checked={fulfillment === 'PICKUP'} disabled={!store.offersPickup} onClick={() => setFulfillment('PICKUP')}>Retrait au dépôt</button>
        </div>
        {fulfillment === 'DELIVERY' && user?.role === 'CLIENT' && (
          <div className="stack-sm" style={{ marginTop: 10 }}>
            {usable.map((a) => (
              <label key={a.id} className="panel" style={{ display: 'flex', gap: 12, cursor: 'pointer' }}>
                <input type="radio" name="addr" checked={addressChoice === a.id} onChange={() => setAddressChoice(a.id)} style={{ width: 22, height: 22, accentColor: '#0c6b58' }} />
                <span><strong>{a.zone.name}</strong><span className="small muted" style={{ display: 'block' }}>{a.details}</span></span>
              </label>
            ))}
            {usable.length > 0 && (
              <label className="panel" style={{ display: 'flex', gap: 12, cursor: 'pointer' }}>
                <input type="radio" name="addr" checked={addressChoice === 'new'} onChange={() => setAddressChoice('new')} style={{ width: 22, height: 22, accentColor: '#0c6b58' }} />
                <span>Livrer à une autre adresse</span>
              </label>
            )}
            {addressChoice === 'new' && (
              <div className="stack-sm">
                <Field label="Commune" hint={`Ce dépôt livre à ${servedZones.map((z) => z.name).join(', ')}.`}>
                  <select className="input" value={newZone} onChange={(e) => setNewZone(e.target.value)}>
                    {servedZones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                  </select>
                </Field>
                <Field label="Adresse et repères pour le livreur">
                  <textarea className="input" value={newDetails} onChange={(e) => setNewDetails(e.target.value)} placeholder="Quartier, rue, immeuble, repère connu" />
                </Field>
              </div>
            )}
          </div>
        )}
        {fulfillment === 'PICKUP' && <p className="small muted">Vous retirez la bouteille à {store.address}. Un code vous sera donné pour la remise.</p>}
      </section>

      <section className="stack-sm" aria-labelledby="pay">
        <h2 id="pay" className="small" style={{ fontFamily: 'var(--font-body)', fontWeight: 700 }}>Paiement</h2>
        <div className="segmented" role="radiogroup" aria-labelledby="pay">
          <button role="radio" aria-checked={payment === 'MOBILE_MONEY'} onClick={() => setPayment('MOBILE_MONEY')}>Mobile money</button>
          <button role="radio" aria-checked={payment === 'CASH_ON_DELIVERY'} onClick={() => setPayment('CASH_ON_DELIVERY')}>
            {fulfillment === 'DELIVERY' ? 'À la livraison' : 'Sur place'}
          </button>
        </div>
      </section>

      <section className="panel stack-sm" aria-label="Récapitulatif">
        <dl className="facts">
          <dt>{qty} × {kind === 'EXCHANGE' ? 'échange' : 'achat'} {name}</dt><dd className="num">{fcfa(unit * qty)}</dd>
          {fulfillment === 'DELIVERY' && (<><dt>Livraison</dt><dd className="num">{fee > 0 ? fcfa(fee) : 'Gratuite'}</dd></>)}
          <dt className="total">Total</dt><dd className="total num" style={{ fontSize: '1.8rem' }}>{fcfa(total)}</dd>
        </dl>
      </section>

      {error && <Notice kind="error">{error}</Notice>}
      <button className="btn btn-block" disabled={busy || !canOrder || user?.role !== 'CLIENT'} onClick={submit}>
        {busy ? 'Envoi…' : 'Commander'}
      </button>
      {kind === 'EXCHANGE' && !hasEmpty && <p className="small muted">Cochez la case pour confirmer que vous avez une bouteille vide à remettre.</p>}
    </div>
  );
}

export default function Page() {
  return <Suspense><OrderForm /></Suspense>;
}
