'use client';
import { FormEvent, useEffect, useState } from 'react';
import { Guard } from '@/components/Shell';
import { Field, Loading, Notice, PageHead } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { fcfa, phoneFmt } from '@/lib/format';
import { Zone } from '@/lib/types';

interface Store {
  id: string; name: string; address: string; phone: string; opensAt: string; closesAt: string; isOpen: boolean;
  offersDelivery: boolean; offersPickup: boolean; deliveryFee: number; areas: { zoneId: string }[];
}

function StoreForm() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [store, setStore] = useState<Store | null | undefined>(undefined);
  const [form, setForm] = useState({
    name: '', address: '', phone: '', opensAt: '07:00', closesAt: '20:00', deliveryFee: 500,
    offersDelivery: true, offersPickup: true, isOpen: true, zoneIds: [] as string[],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<Zone[]>('/catalog/zones').then(setZones).catch((e) => setError(errorText(e)));
    api<Store[]>('/suppliers/me/stores').then((list) => {
      const s = list[0] ?? null;
      setStore(s);
      if (s) setForm({ ...s, phone: phoneFmt(s.phone), zoneIds: s.areas.map((a) => a.zoneId) });
    }).catch((e) => { setError(errorText(e)); setStore(null); });
  }, []);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => { setForm((f) => ({ ...f, [k]: v })); setSaved(false); };
  const toggleZone = (id: string) => set('zoneIds', form.zoneIds.includes(id) ? form.zoneIds.filter((z) => z !== id) : [...form.zoneIds, id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setSaved(false);
    try {
      const { isOpen, ...rest } = form;
      const body = store ? { ...rest, isOpen } : rest;
      const result = await api<Store>(store ? `/suppliers/me/stores/${store.id}` : '/suppliers/me/stores', { method: store ? 'PATCH' : 'POST', body });
      setStore(result);
      setSaved(true);
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }

  if (store === undefined) return <Loading />;

  return (
    <form className="stack-lg" onSubmit={submit}>
      <PageHead title={store ? 'Ma boutique' : 'Créer ma boutique'} back="/fournisseur" />

      {store && (
        <div className="card stack-sm">
          <h2>État de la boutique</h2>
          <div className="segmented" role="radiogroup" aria-label="État de la boutique" style={{ maxWidth: 380 }}>
            <button type="button" role="radio" aria-checked={form.isOpen} onClick={() => set('isOpen', true)}>Ouverte</button>
            <button type="button" role="radio" aria-checked={!form.isOpen} onClick={() => set('isOpen', false)}>En pause</button>
          </div>
          {!form.isOpen && <p className="small muted">En pause, vos produits n’apparaissent plus dans la recherche.</p>}
        </div>
      )}

      <div className="card stack">
        <Field label="Nom de la boutique"><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} required minLength={2} /></Field>
        <Field label="Adresse"><input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} required minLength={3} /></Field>
        <Field label="Téléphone de la boutique"><input className="input" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} required /></Field>
        <div className="cluster" style={{ alignItems: 'flex-end' }}>
          <Field label="Ouvre à"><input className="input" type="time" value={form.opensAt} onChange={(e) => set('opensAt', e.target.value)} required /></Field>
          <Field label="Ferme à"><input className="input" type="time" value={form.closesAt} onChange={(e) => set('closesAt', e.target.value)} required /></Field>
        </div>
      </div>

      <div className="card stack-sm">
        <h2>Remise des bouteilles</h2>
        {([['offersDelivery', 'Je livre chez le client'], ['offersPickup', 'Le client retire au dépôt']] as const).map(([k, label]) => (
          <label key={k} style={{ display: 'flex', gap: 12, alignItems: 'center', minHeight: 44 }}>
            <input type="checkbox" checked={form[k]} onChange={(e) => set(k, e.target.checked)} style={{ width: 26, height: 26 }} />
            {label}
          </label>
        ))}
        {form.offersDelivery && (
          <Field label="Frais de livraison (F)" hint={`Le client paie ${fcfa(form.deliveryFee || 0)} en plus de la bouteille.`}>
            <input className="input" type="number" min={0} step={50} value={form.deliveryFee} onChange={(e) => set('deliveryFee', Number(e.target.value))} style={{ maxWidth: 200 }} />
          </Field>
        )}
      </div>

      <div className="card stack-sm">
        <h2>Communes desservies</h2>
        <div className="chips" role="group" aria-label="Communes desservies">
          {zones.map((z) => (
            <button type="button" key={z.id} className="chip" aria-pressed={form.zoneIds.includes(z.id)} onClick={() => toggleZone(z.id)}>{z.name}</button>
          ))}
        </div>
      </div>

      {error && <Notice kind="error">{error}</Notice>}
      {saved && <Notice kind="ok">Boutique enregistrée.</Notice>}
      <button className="btn btn-block" disabled={busy || form.zoneIds.length === 0 || (!form.offersDelivery && !form.offersPickup)}>
        {store ? 'Enregistrer' : 'Créer ma boutique'}
      </button>
      {form.zoneIds.length === 0 && <p className="small muted">Choisissez au moins une commune desservie.</p>}
    </form>
  );
}

export default function Page() {
  return <Guard roles={['SUPPLIER']}><StoreForm /></Guard>;
}
