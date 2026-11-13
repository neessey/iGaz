'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon, IconName } from '@/components/Icon';
import { Loading, PageHead } from '@/components/ui';
import { useCart } from '@/lib/cart';
import { phoneFmt } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Role } from '@/lib/types';

const ROLE_LABEL: Record<Role, string> = { CLIENT: 'Client', SUPPLIER: 'Vendeur', ADMIN: 'Administration' };

const LINKS: Record<Role, { href: string; label: string; icon: IconName }[]> = {
  CLIENT: [
    { href: '/commandes', label: 'Mes commandes', icon: 'orders' },
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

export default function Profile() {
  const { user, ready, signOut } = useSession();
  const cart = useCart();
  const router = useRouter();

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
      </div>
    );
  }

  const name = user.name?.trim();

  return (
    <div className="stack-lg">
      <PageHead title="Profil" />
      <section className="card profile-head">
        <span className="avatar">{(name ?? 'iG').slice(0, 1).toUpperCase()}</span>
        <span>
          <strong style={{ display: 'block', fontSize: '1.1rem' }}>{name || 'Mon compte'}</strong>
          <span className="muted">{phoneFmt(user.phone)}</span>
          <span className="badge badge-done" style={{ marginTop: 6 }}>{ROLE_LABEL[user.role]}</span>
        </span>
      </section>

      <nav className="card rows-flat" aria-label="Raccourcis" style={{ paddingTop: 4, paddingBottom: 4 }}>
        {LINKS[user.role].map((l) => (
          <Link key={l.href} href={l.href} className="split" style={{ color: 'inherit', textDecoration: 'none', flexWrap: 'nowrap' }}>
            <span className="cluster" style={{ flexWrap: 'nowrap' }}><Icon name={l.icon} size={20} />{l.label}</span>
            <Icon name="chevron" size={18} />
          </Link>
        ))}
      </nav>

      <button className="btn btn-danger btn-block" onClick={() => { signOut(); cart.clear(); router.push('/'); }}>
        <Icon name="logout" size={20} />Se déconnecter
      </button>
    </div>
  );
}
