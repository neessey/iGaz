'use client';
import { FormEvent, useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { Guard } from '@/components/Shell';
import { Empty, Field, Loading, Notice, PageHead } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { Address, Zone } from '@/lib/types';

const LABELS = ['Domicile', 'Bureau', 'Famille'];

/** Formulaire d'adresse (ajout ou modification). */
function AddressForm({ zones, initial, onDone, onCancel }: {
  zones: Zone[]; initial?: Address; onDone: () => void; onCancel: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? 'Domicile');
  const [zoneId, setZoneId] = useState(initial?.zoneId ?? zones[0]?.id ?? '');
  const [details, setDetails] = useState(initial?.details ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const body = { label: label.trim() || 'Domicile', zoneId, details: details.trim() };
      if (initial) await api(`/addresses/${initial.id}`, { method: 'PATCH', body });
      else await api('/addresses', { body });
      onDone();
    } catch (err) { setError(errorText(err)); setBusy(false); }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <h2>{initial ? 'Modifier l’adresse' : 'Nouvelle adresse'}</h2>
      <div className="stack-sm">
        <span className="label-sm">Nom de l’adresse</span>
        <div className="chips" role="group" aria-label="Nom de l’adresse">
          {LABELS.map((l) => (
            <button type="button" key={l} className="chip" aria-pressed={label === l} onClick={() => setLabel(l)}>{l}</button>
          ))}
        </div>
        <input className="input" aria-label="Autre nom" maxLength={40} value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <Field label="Commune">
        <select className="input" value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
          {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
        </select>
      </Field>
      <Field label="Adresse et repères pour le livreur" hint="Quartier, rue, immeuble, couleur du portail, repère connu.">
        <textarea className="input" required minLength={3} maxLength={250} value={details} onChange={(e) => setDetails(e.target.value)} />
      </Field>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="cluster">
        <button className="btn" disabled={busy || details.trim().length < 3 || !zoneId}>{initial ? 'Enregistrer' : 'Ajouter l’adresse'}</button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>Annuler</button>
      </div>
    </form>
  );
}

function Addresses() {
  const [list, setList] = useState<Address[] | null>(null);
  const [zones, setZones] = useState<Zone[]>([]);
  const [editing, setEditing] = useState<Address | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = () => api<Address[]>('/addresses').then(setList).catch((e) => setError(errorText(e)));
  useEffect(() => {
    load();
    api<Zone[]>('/catalog/zones').then(setZones).catch(() => undefined);
  }, []);

  async function remove(a: Address) {
    if (!window.confirm(`Supprimer l’adresse « ${a.label} » ?`)) return;
    setError(null);
    try { await api(`/addresses/${a.id}`, { method: 'DELETE' }); setInfo('Adresse supprimée.'); load(); }
    catch (e) { setError(errorText(e)); }
  }

  if (!list) return error ? <Notice kind="error">{error}</Notice> : <Loading />;

  return (
    <div className="stack-lg">
      <PageHead title="Mes adresses" back="/profil" />
      {error && <Notice kind="error">{error}</Notice>}
      {info && <Notice kind="ok">{info}</Notice>}

      {editing ? (
        <AddressForm zones={zones} initial={editing === 'new' ? undefined : editing}
          onDone={() => { setEditing(null); setInfo(editing === 'new' ? 'Adresse ajoutée.' : 'Adresse modifiée.'); load(); }}
          onCancel={() => setEditing(null)} />
      ) : (
        <>
          {list.length === 0 ? (
            <Empty title="Aucune adresse enregistrée">Ajoutez votre domicile ou votre bureau : vous la choisirez en un geste à la commande.</Empty>
          ) : (
            <div className="rows">
              {list.map((a) => (
                <article key={a.id} className="card activity" style={{ gridTemplateColumns: '40px 1fr auto' }}>
                  <span className="activity-icon"><Icon name={a.label === 'Bureau' ? 'store' : 'home'} size={20} /></span>
                  <span style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block' }}>{a.label}</strong>
                    <span className="small">{a.zone.name}</span>
                    <span className="small muted" style={{ display: 'block' }}>{a.details}</span>
                  </span>
                  <span className="cluster" style={{ gap: 6, flexWrap: 'nowrap' }}>
                    <button className="icon-btn" style={{ background: 'var(--violet-soft)', color: 'var(--violet)' }} aria-label={`Modifier ${a.label}`} onClick={() => { setInfo(null); setEditing(a); }}>
                      <Icon name="edit" size={18} />
                    </button>
                    <button className="icon-btn" style={{ background: 'var(--red-soft)', color: 'var(--red)' }} aria-label={`Supprimer ${a.label}`} onClick={() => remove(a)}>
                      <Icon name="trash" size={18} />
                    </button>
                  </span>
                </article>
              ))}
            </div>
          )}
          <button className="btn btn-block" onClick={() => { setInfo(null); setEditing('new'); }}><Icon name="plus" size={20} />Ajouter une adresse</button>
        </>
      )}
    </div>
  );
}

export default function Page() {
  return <Guard roles={['CLIENT']}><Addresses /></Guard>;
}
