'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Cylinder } from '@/components/Cylinder';
import { Guard } from '@/components/Shell';
import { Empty, Field, Loading, Notice } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { fcfa } from '@/lib/format';
import { Brand, Cylinder as CylinderType } from '@/lib/types';

interface Product {
  id: string; purchasePrice: number; exchangePrice: number; isActive: boolean;
  brand: Brand; cylinderType: CylinderType; inventory: { quantity: number } | null;
}

function Row({ storeId, product, onChange }: { storeId: string; product: Product; onChange: () => void }) {
  const current = product.inventory?.quantity ?? 0;
  const [qty, setQty] = useState(current);
  const [editing, setEditing] = useState(false);
  const [purchase, setPurchase] = useState(product.purchasePrice);
  const [exchange, setExchange] = useState(product.exchangePrice);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => setQty(current), [current]);

  async function run(fn: () => Promise<unknown>, okText: string) {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ kind: 'ok', text: okText }); onChange(); }
    catch (e) { setMsg({ kind: 'error', text: errorText(e) }); }
    finally { setBusy(false); }
  }

  const base = `/stores/${storeId}/products/${product.id}`;

  return (
    <article className="stack-sm" style={{ opacity: product.isActive ? 1 : 0.6 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr', gap: 14, alignItems: 'center' }}>
        <span className="cyl-slot" style={{ height: 80 }}><Cylinder kg={product.cylinderType.capacityKg} /></span>
        <div>
          <h3>{product.brand.name} {product.cylinderType.label}</h3>
          <p className="small muted">Achat {fcfa(product.purchasePrice)}, échange {fcfa(product.exchangePrice)}{product.isActive ? '' : '. Masqué aux clients'}</p>
        </div>
      </div>
      <div className="cluster">
        <span className="stepper">
          <button aria-label="Une bouteille de moins" onClick={() => setQty((q) => Math.max(0, q - 1))}>−</button>
          <input aria-label={`Stock ${product.brand.name} ${product.cylinderType.label}`} className="num" inputMode="numeric"
            value={qty} onChange={(e) => setQty(Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0))}
            style={{ width: 64, border: 0, background: 'transparent', textAlign: 'center', fontSize: '1.8rem' }} />
          <button aria-label="Une bouteille de plus" onClick={() => setQty((q) => q + 1)}>+</button>
        </span>
        <button className="btn btn-small" disabled={busy || qty === current}
          onClick={() => run(() => api(`${base}/stock`, { method: 'PUT', body: { quantity: qty } }), 'Stock enregistré')}>
          Enregistrer le stock
        </button>
      </div>
      {current === 0 && <p className="small" style={{ color: 'var(--rust)', fontWeight: 700 }}>En rupture : ce produit n’apparaît pas dans la recherche.</p>}
      <div className="cluster">
        <button className="btn btn-quiet btn-small" onClick={() => setEditing((v) => !v)}>{editing ? 'Fermer' : 'Modifier les prix'}</button>
        <button className="btn btn-quiet btn-small" disabled={busy}
          onClick={() => run(() => api(base, { method: 'PATCH', body: { isActive: !product.isActive } }), product.isActive ? 'Produit masqué' : 'Produit visible')}>
          {product.isActive ? 'Masquer' : 'Remettre en vente'}
        </button>
      </div>
      {editing && (
        <div className="stack-sm panel">
          <div className="cluster" style={{ alignItems: 'flex-end' }}>
            <Field label="Prix d’achat (F)"><input className="input" type="number" min={0} step={50} value={purchase} onChange={(e) => setPurchase(Number(e.target.value))} /></Field>
            <Field label="Prix d’échange (F)"><input className="input" type="number" min={0} step={50} value={exchange} onChange={(e) => setExchange(Number(e.target.value))} /></Field>
          </div>
          <p className="small muted">Les commandes déjà passées gardent leur prix.</p>
          <button className="btn btn-small" disabled={busy}
            onClick={() => run(async () => { await api(base, { method: 'PATCH', body: { purchasePrice: purchase, exchangePrice: exchange } }); setEditing(false); }, 'Prix enregistrés')}>
            Enregistrer les prix
          </button>
        </div>
      )}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </article>
  );
}

function AddProduct({ storeId, brands, cylinders, onAdded }: { storeId: string; brands: Brand[]; cylinders: CylinderType[]; onAdded: () => void }) {
  const [brandId, setBrandId] = useState('');
  const [cylinderTypeId, setCylinderTypeId] = useState('');
  const [purchasePrice, setPurchase] = useState(7500);
  const [exchangePrice, setExchange] = useState(1500);
  const [quantity, setQuantity] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true); setError(null);
    try {
      await api(`/stores/${storeId}/products`, { body: { brandId, cylinderTypeId, purchasePrice, exchangePrice, quantity } });
      setBrandId(''); setCylinderTypeId(''); setQuantity(0);
      onAdded();
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  return (
    <section className="panel panel-flag stack" aria-labelledby="add">
      <h2 id="add">Ajouter un produit</h2>
      <Field label="Marque">
        <select className="input" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
          <option value="">Choisir une marque</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </Field>
      <Field label="Taille">
        <select className="input" value={cylinderTypeId} onChange={(e) => setCylinderTypeId(e.target.value)}>
          <option value="">Choisir une taille</option>
          {cylinders.map((c) => <option key={c.id} value={c.id}>{c.label} ({c.capacityKg} kg)</option>)}
        </select>
      </Field>
      <div className="cluster" style={{ alignItems: 'flex-end' }}>
        <Field label="Prix d’achat (F)"><input className="input" type="number" min={0} step={50} value={purchasePrice} onChange={(e) => setPurchase(Number(e.target.value))} /></Field>
        <Field label="Prix d’échange (F)"><input className="input" type="number" min={0} step={50} value={exchangePrice} onChange={(e) => setExchange(Number(e.target.value))} /></Field>
      </div>
      <Field label="Quantité en stock"><input className="input" type="number" min={0} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} style={{ maxWidth: 160 }} /></Field>
      {error && <Notice kind="error">{error}</Notice>}
      <button className="btn" disabled={busy || !brandId || !cylinderTypeId} onClick={add}>Ajouter le produit</button>
      {brands.length === 0 && <p className="small muted">Aucune marque n’est encore disponible : elles sont gérées par l’équipe iGaz.</p>}
    </section>
  );
}

function Stock() {
  const [stores, setStores] = useState<{ id: string; name: string }[] | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [cylinders, setCylinders] = useState<CylinderType[]>([]);
  const [error, setError] = useState<string | null>(null);

  const store = stores?.[0];
  const load = useCallback(() => {
    if (store) api<Product[]>(`/stores/${store.id}/products`).then(setProducts).catch((e) => setError(errorText(e)));
  }, [store]);

  useEffect(() => {
    api<{ id: string; name: string }[]>('/suppliers/me/stores').then(setStores).catch((e) => setError(errorText(e)));
    api<Brand[]>('/catalog/brands').then(setBrands).catch(() => undefined);
    api<CylinderType[]>('/catalog/cylinder-types').then(setCylinders).catch(() => undefined);
  }, []);
  useEffect(load, [load]);

  if (error) return <Notice kind="error">{error}</Notice>;
  if (!stores) return <Loading />;
  if (!store) return (
    <div className="stack">
      <h1>Stock</h1>
      <Empty title="Créez d’abord votre boutique">Il faut une boutique pour ajouter des produits.</Empty>
      <Link className="btn" href="/fournisseur/boutique">Créer ma boutique</Link>
    </div>
  );

  return (
    <div className="stack-lg">
      <div className="stack-sm">
        <h1>Stock</h1>
        <p className="muted">{store.name}. Mettez à jour vos quantités chaque jour : les clients ne voient que ce qui est en stock.</p>
      </div>
      {!products ? <Loading /> : products.length === 0 ? (
        <Empty title="Aucun produit pour l’instant">Ajoutez votre première bouteille ci-dessous.</Empty>
      ) : (
        <div className="rows">{products.map((p) => <Row key={p.id} storeId={store.id} product={p} onChange={load} />)}</div>
      )}
      <AddProduct storeId={store.id} brands={brands} cylinders={cylinders} onAdded={load} />
    </div>
  );
}

export default function Page() {
  return <Guard roles={['SUPPLIER']}><Stock /></Guard>;
}
