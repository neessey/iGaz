'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/Icon';
import { Guard } from '@/components/Shell';
import { Field, Loading, Notice, PageHead } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { fcfa } from '@/lib/format';
import { Address, Offer, Zone } from '@/lib/types';

type Mode = 'DELIVERY' | 'PICKUP';

/** Validation du panier : relit prix et stock, choisit le mode par dépôt, l'adresse et le paiement, puis crée les commandes. */
function Checkout() {
  const router = useRouter();
  const cart = useCart();
  const [offers, setOffers] = useState<Record<string, Offer> | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [modes, setModes] = useState<Record<string, Mode>>({});
  const [addressChoice, setAddressChoice] = useState('new');
  const [newZone, setNewZone] = useState('');
  const [newDetails, setNewDetails] = useState('');
  const [payment, setPayment] = useState<'MOBILE_MONEY' | 'CASH_ON_DELIVERY'>('MOBILE_MONEY');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const productIds = useMemo(() => [...new Set(cart.lines.map((l) => l.productId))].sort().join(','), [cart.lines]);

  // Prix et stock en direct : le panier peut dater de plusieurs heures.
  useEffect(() => {
    if (!cart.ready || !productIds) return;
    Promise.all(productIds.split(',').map((id) => api<Offer>(`/products/${id}`).catch(() => null)))
      .then((list) => {
        const map: Record<string, Offer> = {};
        for (const o of list) {
          if (!o) continue;
          map[o.id] = o;
          cart.refresh(o.id, { purchasePrice: o.purchasePrice, exchangePrice: o.exchangePrice, maxQty: Math.min(o.inventory?.quantity ?? 0, 10) });
        }
        setOffers(map);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.ready, productIds]);

  useEffect(() => {
    api<Zone[]>('/catalog/zones').then(setZones).catch(() => undefined);
    api<Address[]>('/addresses').then((a) => { setAddresses(a); if (a[0]) setAddressChoice(a[0].id); }).catch(() => undefined);
  }, []);

  const storeOf = (storeId: string) => {
    const line = cart.lines.find((l) => l.storeId === storeId);
    return line && offers ? offers[line.productId]?.store : undefined;
  };

  // Mode par défaut : livraison si le dépôt la propose.
  useEffect(() => {
    if (!offers) return;
    setModes((cur) => {
      const next = { ...cur };
      for (const g of cart.groups) {
        const s = storeOf(g.storeId);
        if (!s) continue;
        const current = next[g.storeId];
        if (!current || (current === 'DELIVERY' && !s.offersDelivery) || (current === 'PICKUP' && !s.offersPickup)) {
          next[g.storeId] = s.offersDelivery ? 'DELIVERY' : 'PICKUP';
        }
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offers, cart.groups.length]);

  useEffect(() => { if (!newZone && zones[0]) setNewZone(zones[0].id); }, [zones, newZone]);

  if (!cart.ready || (cart.lines.length > 0 && !offers)) return <Loading>Vérification des prix et du stock…</Loading>;
  if (cart.lines.length === 0) {
    return (
      <div className="stack">
        <PageHead title="Valider la commande" back="/panier" />
        <Notice>Votre panier est vide.</Notice>
        <Link className="btn btn-block" href="/">Trouver du gaz</Link>
      </div>
    );
  }

  const needsAddress = cart.groups.some((g) => modes[g.storeId] === 'DELIVERY');
  const zoneId = addressChoice === 'new' ? newZone : addresses.find((a) => a.id === addressChoice)?.zoneId;
  const zoneName = zones.find((z) => z.id === zoneId)?.name;

  // Problèmes bloquants, par dépôt, affichés là où le client peut les régler.
  const problems: Record<string, string[]> = {};
  for (const g of cart.groups) {
    const list: string[] = [];
    const s = storeOf(g.storeId);
    for (const l of g.lines) {
      const o = offers![l.productId];
      if (!o || o.available === false) list.push(`${l.brandName} ${l.label} n’est plus disponible : retirez-la du panier.`);
      else if (l.quantity > (o.inventory?.quantity ?? 0)) list.push(`Plus que ${o.inventory?.quantity ?? 0} ${l.brandName} ${l.label} en stock : réduisez la quantité.`);
    }
    if (s && modes[g.storeId] === 'DELIVERY' && zoneId && !s.areas?.some((a) => a.zoneId === zoneId)) {
      list.push(`Ce dépôt ne livre pas à ${zoneName}. Choisissez le retrait au dépôt ou une autre adresse.`);
    }
    if (list.length) problems[g.storeId] = list;
  }
  const blocked = Object.keys(problems).length > 0 || (needsAddress && addressChoice === 'new' && newDetails.trim().length < 3);

  const feeOf = (storeId: string) => (modes[storeId] === 'DELIVERY' ? storeOf(storeId)?.deliveryFee ?? 0 : 0);
  const total = cart.groups.reduce((sum, g) => sum + g.subtotal + feeOf(g.storeId), 0);

  async function submit() {
    setBusy(true); setError(null);
    try {
      let addressId: string | undefined;
      if (needsAddress) {
        addressId = addressChoice === 'new'
          ? (await api<Address>('/addresses', { body: { zoneId: newZone, details: newDetails.trim() } })).id
          : addressChoice;
      }
      const checkout = await api<{ id: string }>('/checkouts', {
        body: {
          paymentMethod: payment, addressId,
          stores: cart.groups.map((g) => ({
            storeId: g.storeId, fulfillment: modes[g.storeId],
            items: g.lines.map((l) => ({
              productId: l.productId, kind: l.kind, quantity: l.quantity,
              ...(l.kind === 'EXCHANGE' ? { returnedBrandId: l.brandId, returnedCylinderTypeId: l.cylinderTypeId } : {}),
            })),
          })),
        },
      });
      cart.clear();
      router.replace(`/commandes/panier/${checkout.id}`);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <div className="stack-lg">
      <PageHead title="Valider la commande" back="/panier" />

      {cart.groups.map((g) => {
        const s = storeOf(g.storeId);
        const fee = feeOf(g.storeId);
        return (
          <section key={g.storeId} className="card stack-sm" aria-label={`Commande chez ${g.storeName}`}>
            <span className="cluster" style={{ gap: 8, fontWeight: 800 }}><Icon name="store" size={20} />{g.storeName}</span>
            <p className="small muted">{g.lines.map((l) => `${l.quantity} × ${l.brandName} ${l.label} (${l.kind === 'EXCHANGE' ? 'échange' : 'achat'})`).join(', ')}</p>
            <div className="segmented" role="radiogroup" aria-label={`Réception chez ${g.storeName}`}>
              <button role="radio" aria-checked={modes[g.storeId] === 'DELIVERY'} disabled={!s?.offersDelivery}
                onClick={() => setModes((m) => ({ ...m, [g.storeId]: 'DELIVERY' }))}>
                Livraison{s && s.deliveryFee > 0 ? ` (${fcfa(s.deliveryFee)})` : ''}
              </button>
              <button role="radio" aria-checked={modes[g.storeId] === 'PICKUP'} disabled={!s?.offersPickup}
                onClick={() => setModes((m) => ({ ...m, [g.storeId]: 'PICKUP' }))}>
                Retrait au dépôt
              </button>
            </div>
            {modes[g.storeId] === 'PICKUP' && s && <p className="small muted">À retirer à {s.address}.</p>}
            {problems[g.storeId]?.map((p) => <Notice key={p} kind="error">{p}</Notice>)}
            <div className="split small"><span className="muted">Sous-total{fee > 0 ? ' + livraison' : ''}</span><strong className="num">{fcfa(g.subtotal + fee)}</strong></div>
          </section>
        );
      })}

      {needsAddress && (
        <section className="card stack-sm" aria-labelledby="adresse">
          <h2 id="adresse" className="cluster" style={{ gap: 8 }}><Icon name="pin" size={20} />Adresse de livraison</h2>
          <div className="stack-sm" role="radiogroup" aria-labelledby="adresse">
            {addresses.map((a) => (
              <button key={a.id} className="choice" role="radio" aria-checked={addressChoice === a.id} onClick={() => setAddressChoice(a.id)}>
                <strong>{a.zone.name}</strong><span className="small muted" style={{ display: 'block' }}>{a.details}</span>
              </button>
            ))}
            {addresses.length > 0 && (
              <button className="choice" role="radio" aria-checked={addressChoice === 'new'} onClick={() => setAddressChoice('new')}>
                <strong>Une autre adresse</strong>
              </button>
            )}
          </div>
          {addressChoice === 'new' && (
            <div className="stack-sm">
              <Field label="Commune">
                <select className="input" value={newZone} onChange={(e) => setNewZone(e.target.value)}>
                  {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </Field>
              <Field label="Adresse et repères pour le livreur">
                <textarea className="input" value={newDetails} onChange={(e) => setNewDetails(e.target.value)} placeholder="Quartier, rue, immeuble, repère connu" />
              </Field>
            </div>
          )}
        </section>
      )}

      <section className="card stack-sm" aria-labelledby="pay">
        <h2 id="pay" className="cluster" style={{ gap: 8 }}><Icon name="wallet" size={20} />Paiement</h2>
        <div className="segmented" role="radiogroup" aria-labelledby="pay">
          <button role="radio" aria-checked={payment === 'MOBILE_MONEY'} onClick={() => setPayment('MOBILE_MONEY')}>Mobile money</button>
          <button role="radio" aria-checked={payment === 'CASH_ON_DELIVERY'} onClick={() => setPayment('CASH_ON_DELIVERY')}>À la remise</button>
        </div>
        <p className="small muted">
          {payment === 'MOBILE_MONEY'
            ? (cart.groups.length > 1 ? 'Un seul paiement pour tous les dépôts.' : 'Vous payez avant que le dépôt ne prépare la commande.')
            : (cart.groups.length > 1 ? 'Chaque dépôt encaisse sa commande à la remise.' : 'Vous payez le dépôt à la remise de la bouteille.')}
        </p>
      </section>

      <section className="card" aria-label="Total">
        <dl className="facts">
          <dt>Bouteilles</dt><dd className="num">{fcfa(cart.subtotal)}</dd>
          <dt>Livraison</dt><dd className="num">{fcfa(total - cart.subtotal)}</dd>
          <dt className="total">Total</dt><dd className="total num price">{fcfa(total)}</dd>
        </dl>
      </section>

      {error && <Notice kind="error">{error}</Notice>}

      <div className="sticky-cta">
        <button className="btn" disabled={busy || blocked} onClick={submit}>
          {busy ? 'Envoi…' : cart.groups.length > 1 ? `Commander chez ${cart.groups.length} dépôts · ${fcfa(total)}` : `Commander · ${fcfa(total)}`}
        </button>
      </div>
    </div>
  );
}

export default function Page() {
  return <Guard roles={['CLIENT']}><Checkout /></Guard>;
}
