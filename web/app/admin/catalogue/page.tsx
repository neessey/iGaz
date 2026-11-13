'use client';
import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import { Guard } from '@/components/Shell';
import { Loading, Notice } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { Brand, Cylinder, Zone } from '@/lib/types';

function Section<T extends { id: string; isActive: boolean }>({
  title, path, items, label, onChange, form,
}: {
  title: string; path: string; items: T[]; label: (i: T) => string; onChange: () => void;
  form: (submit: (body: object) => Promise<void>, busy: boolean) => ReactNode;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); onChange(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <section className="stack-sm" aria-label={title}>
      <h2>{title}</h2>
      <div className="rows">
        {items.map((i) => (
          <div key={i.id} className="split" style={{ opacity: i.isActive ? 1 : 0.55 }}>
            <strong>{label(i)}{i.isActive ? '' : ' (désactivé)'}</strong>
            <button className="btn btn-quiet btn-small" disabled={busy}
              onClick={() => run(() => api(`${path}/${i.id}`, { method: 'PATCH', body: { isActive: !i.isActive } }))}>
              {i.isActive ? 'Désactiver' : 'Réactiver'}
            </button>
          </div>
        ))}
      </div>
      {form((body) => run(() => api(path, { body })), busy)}
      {error && <Notice kind="error">{error}</Notice>}
    </section>
  );
}

function Catalog() {
  const [brands, setBrands] = useState<Brand[] | null>(null);
  const [cylinders, setCylinders] = useState<Cylinder[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [brand, setBrand] = useState('');
  const [label, setLabel] = useState('');
  const [kg, setKg] = useState(6);
  const [zone, setZone] = useState('');

  const load = useCallback(() => {
    Promise.all([api<Brand[]>('/admin/brands'), api<Cylinder[]>('/admin/cylinder-types'), api<Zone[]>('/admin/zones')])
      .then(([b, c, z]) => { setBrands(b); setCylinders(c); setZones(z); })
      .catch((e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);

  if (error) return <Notice kind="error">{error}</Notice>;
  if (!brands) return <Loading />;

  return (
    <div className="stack-lg">
      <div className="stack-sm">
        <h1>Catalogue central</h1>
        <p className="muted">Les fournisseurs ne peuvent publier que les marques et tailles listées ici.</p>
      </div>

      <Section title="Marques" path="/admin/brands" items={brands} label={(b) => b.name} onChange={load}
        form={(submit, busy) => (
          <form className="cluster" onSubmit={(e: FormEvent) => { e.preventDefault(); submit({ name: brand }).then(() => setBrand('')); }}>
            <input className="input" style={{ maxWidth: 260 }} placeholder="Nouvelle marque" aria-label="Nouvelle marque" value={brand} onChange={(e) => setBrand(e.target.value)} />
            <button className="btn btn-small" disabled={busy || brand.trim().length < 2}>Ajouter</button>
          </form>
        )} />

      <Section title="Tailles de bouteille" path="/admin/cylinder-types" items={cylinders} label={(c) => `${c.label}, ${c.capacityKg} kg`} onChange={load}
        form={(submit, busy) => (
          <form className="cluster" onSubmit={(e: FormEvent) => { e.preventDefault(); submit({ label, capacityKg: kg }).then(() => setLabel('')); }}>
            <input className="input" style={{ maxWidth: 120 }} placeholder="B6" aria-label="Nom du format" value={label} onChange={(e) => setLabel(e.target.value.toUpperCase())} />
            <input className="input" style={{ maxWidth: 120 }} type="number" min={1} aria-label="Poids en kg" value={kg} onChange={(e) => setKg(Number(e.target.value))} />
            <span className="muted">kg</span>
            <button className="btn btn-small" disabled={busy || !/^B\d{1,3}$/.test(label)}>Ajouter</button>
          </form>
        )} />

      <Section title="Communes desservies" path="/admin/zones" items={zones} label={(z) => z.name} onChange={load}
        form={(submit, busy) => (
          <form className="cluster" onSubmit={(e: FormEvent) => { e.preventDefault(); submit({ name: zone }).then(() => setZone('')); }}>
            <input className="input" style={{ maxWidth: 260 }} placeholder="Nouvelle commune" aria-label="Nouvelle commune" value={zone} onChange={(e) => setZone(e.target.value)} />
            <button className="btn btn-small" disabled={busy || zone.trim().length < 2}>Ajouter</button>
          </form>
        )} />
    </div>
  );
}

export default function Page() {
  return <Guard roles={['ADMIN']}><Catalog /></Guard>;
}
