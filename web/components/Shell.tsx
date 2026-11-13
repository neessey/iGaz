'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { useSession } from '@/lib/session';
import { Role } from '@/lib/types';
import { Loading } from './ui';

const NAV: Record<Role, { href: string; label: string }[]> = {
  CLIENT: [
    { href: '/', label: 'Trouver du gaz' },
    { href: '/commandes', label: 'Mes commandes' },
  ],
  SUPPLIER: [
    { href: '/fournisseur', label: 'Commandes' },
    { href: '/fournisseur/stock', label: 'Stock' },
    { href: '/fournisseur/boutique', label: 'Ma boutique' },
  ],
  ADMIN: [
    { href: '/admin', label: 'Aperçu' },
    { href: '/admin/catalogue', label: 'Catalogue' },
    { href: '/admin/commandes', label: 'Commandes' },
    { href: '/admin/audit', label: 'Journal' },
  ],
};

export function Shell({ children }: { children: ReactNode }) {
  const { user, signOut } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const links = user ? NAV[user.role] : [{ href: '/', label: 'Trouver du gaz' }];
  const current = [...links].sort((a, b) => b.href.length - a.href.length).find(
    (l) => pathname === l.href || (l.href !== '/' && pathname.startsWith(l.href)),
  );

  return (
    <>
      <header>
        <div className="topbar">
          <div className="topbar-in">
            <Link href="/" className="wordmark">i<span>Gaz</span></Link>
            {user ? (
              <button className="who" onClick={() => { signOut(); router.push('/'); }}>
                Se déconnecter
              </button>
            ) : (
              <Link className="who" href="/connexion">Se connecter</Link>
            )}
          </div>
        </div>
        <nav className="nav" aria-label="Navigation principale">
          <div className="nav-in">
            {links.map((l) => (
              <Link key={l.href} href={l.href} aria-current={current?.href === l.href ? 'page' : undefined}>
                {l.label}
              </Link>
            ))}
          </div>
        </nav>
      </header>
      <main className="page">{children}</main>
    </>
  );
}

/** Réserve une page à certains rôles ; redirige vers la connexion sinon. */
export function Guard({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, ready } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ready && !user) router.replace(`/connexion?next=${encodeURIComponent(pathname)}`);
  }, [ready, user, router, pathname]);

  if (!ready || !user) return <Loading />;
  if (!roles.includes(user.role)) {
    return (
      <div className="panel panel-stop stack-sm">
        <h2>Cette page n’est pas pour votre compte</h2>
        <p className="muted">Retournez à l’accueil pour continuer.</p>
        <Link className="btn btn-quiet" href="/">Aller à l’accueil</Link>
      </div>
    );
  }
  return <>{children}</>;
}
