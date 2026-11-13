'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Icon, IconName } from '@/components/Icon';
import { Field, Loading, Notice, PageHead } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { phoneFmt } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Role } from '@/lib/types';

const ROLE_LABEL: Record<Role, string> = { CLIENT: 'Client', SUPPLIER: 'Vendeur', ADMIN: 'Administration' };

const LINKS: Record<Role, { href: string; label: string; icon: IconName }[]> = {
  CLIENT: [
    { href: '/commandes', label: 'Mes commandes', icon: 'orders' },
    { href: '/profil/adresses', label: 'Mes adresses', icon: 'pin' },
    { href: '/fournisseur/inscription', label: 'Ouvrir ma boutique', icon: 'store' },
  ],
  SUPPLIER: [
    { href: '/fournisseur', label: 'Commandes reçues', icon: 'orders' },
    { href: '/fournisseur/stock', label: 'Mon stock', icon: 'box' },
    { href: '/fournisseur/boutique', label: 'Ma boutique', icon: 'store' },
  ],
  ADMIN: [
    { href: '/admin', label: 'Tableau de bord', icon: 'grid' },
    { href: '/admin/audit', label: 'Journal d’audit', icon: 'journal' },
  ],
};

/** Aide et informations légales : pour tous, connecté ou non (exigences du Play Store). */
const INFO: { href: string; label: string; icon: IconName }[] = [
  { href: '/aide', label: 'Aide et contact', icon: 'phone' },
  { href: '/conditions', label: 'Conditions d’utilisation', icon: 'journal' },
  { href: '/confidentialite', label: 'Confidentialité', icon: 'shield' },
];

const initialsOf = (name?: string) =>
  (name ? name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('') : 'iG').toUpperCase();

/** Modifier son prénom et son nom (enregistrés ensemble : « Prénom Nom »). */
function NameForm({ current, onDone }: { current: string; onDone: () => void }) {
  const { refresh } = useSession();
  const [first, ...rest] = current.split(/\s+/).filter(Boolean);
  const [firstName, setFirstName] = useState(first ?? '');
  const [lastName, setLastName] = useState(rest.join(' '));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api('/auth/me', { method: 'PATCH', body: { firstName: firstName.trim(), lastName: lastName.trim() } });
      await refresh();
      onDone();
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }

  return (
    <form className="stack-sm" onSubmit={save}>
      {!current && <p className="small muted">Ajoutez votre nom : le dépôt saura qui il livre.</p>}
      <div className="name-grid">
        <Field label="Prénom"><input className="input" autoComplete="given-name" maxLength={40} required value={firstName} onChange={(e) => setFirstName(e.target.value)} /></Field>
        <Field label="Nom"><input className="input" autoComplete="family-name" maxLength={40} required value={lastName} onChange={(e) => setLastName(e.target.value)} /></Field>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="cluster">
        <button className="btn btn-small" disabled={busy || !firstName.trim() || !lastName.trim()}>Enregistrer</button>
        {current && <button type="button" className="btn btn-quiet btn-small" onClick={onDone}>Annuler</button>}
      </div>
    </form>
  );
}

function LinkList({ label, items }: { label: string; items: { href: string; label: string; icon: IconName }[] }) {
  return (
    <nav className="card rows-flat" aria-label={label} style={{ paddingTop: 4, paddingBottom: 4 }}>
      {items.map((l) => (
        <Link key={l.href} href={l.href} className="split" style={{ color: 'inherit', textDecoration: 'none', flexWrap: 'nowrap' }}>
          <span className="cluster" style={{ flexWrap: 'nowrap' }}><Icon name={l.icon} size={20} />{l.label}</span>
          <Icon name="chevron" size={18} />
        </Link>
      ))}
    </nav>
  );
}

export default function Profile() {
  const { user, ready, signOut } = useSession();
  const cart = useCart();
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  if (!ready) return <Loading />;

  if (!user) {
    return (
      <div className="stack-lg">
        <PageHead title="Profil" />
        <div className="card stack" style={{ textAlign: 'center' }}>
          <span className="avatar" style={{ margin: '0 auto' }}><Icon name="user" size={26} /></span>
          <p style={{ margin: '0 auto' }}>Connectez-vous pour suivre vos commandes et retrouver vos adresses.</p>
          <Link className="btn btn-block" href="/connexion">Se connecter</Link>
        </div>
        <LinkList label="Aide et informations" items={INFO} />
      </div>
    );
  }

  const name = user.name?.trim();

  return (
    <div className="stack-lg">
      <PageHead title="Profil" />
      <section className="card stack">
        <div className="profile-head">
          <span className="avatar">{initialsOf(name)}</span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <strong style={{ display: 'block', fontSize: '1.1rem' }}>{name || 'Mon compte'}</strong>
            <span className="muted">{phoneFmt(user.phone)}</span>
            <span className="badge badge-done" style={{ marginTop: 6 }}>{ROLE_LABEL[user.role]}</span>
          </span>
          {!editing && (
            <button className="icon-btn" style={{ background: 'var(--violet-soft)', color: 'var(--violet)' }}
              aria-label="Modifier mon nom" onClick={() => setEditing(true)}>
              <Icon name="edit" size={18} />
            </button>
          )}
        </div>
        {(editing || !name) && <NameForm current={name ?? ''} onDone={() => setEditing(false)} />}
      </section>

      <LinkList label="Raccourcis" items={LINKS[user.role]} />
      <LinkList label="Aide et informations" items={INFO} />

      <button className="btn btn-quiet btn-block" onClick={() => { signOut(); cart.clear(); router.push('/'); }}>
        <Icon name="logout" size={20} />Se déconnecter
      </button>
      {user.role !== 'ADMIN' && (
        <Link className="btn btn-danger btn-block" href="/compte/supprimer"><Icon name="trash" size={20} />Supprimer mon compte</Link>
      )}
    </div>
  );
}
