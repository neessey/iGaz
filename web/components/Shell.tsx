'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { useCart } from '@/lib/cart';
import { isStandalone, prefersWeb } from '@/lib/install';
import { useSession } from '@/lib/session';
import { Role } from '@/lib/types';
import { Bell } from './Bell';
import { CartBar } from './CartBar';
import { Icon, IconName } from './Icon';
import { Logo } from './Logo';
import { OfflineNotice, ServiceWorker } from './Pwa';
import { Splash, useLaunching } from './Splash';
import { Loading } from './ui';

type Tab = { href: string; label: string; icon: IconName };

const GUEST: Tab[] = [
  { href: '/', label: 'Accueil', icon: 'home' },
  { href: '/panier', label: 'Panier', icon: 'cart' },
  { href: '/commandes', label: 'Commandes', icon: 'orders' },
  { href: '/profil', label: 'Profil', icon: 'user' },
];

const TABS: Record<Role, Tab[]> = {
  CLIENT: GUEST,
  SUPPLIER: [
    { href: '/fournisseur', label: 'Accueil', icon: 'home' },
    { href: '/fournisseur/stock', label: 'Stock', icon: 'box' },
    { href: '/fournisseur/boutique', label: 'Boutique', icon: 'store' },
    { href: '/profil', label: 'Profil', icon: 'user' },
  ],
  ADMIN: [
    { href: '/admin', label: 'Tableau', icon: 'grid' },
    { href: '/admin/catalogue', label: 'Catalogue', icon: 'tag' },
    { href: '/admin/commandes', label: 'Commandes', icon: 'orders' },
    { href: '/admin/audit', label: 'Journal', icon: 'journal' },
    { href: '/profil', label: 'Profil', icon: 'user' },
  ],
};

/** Pages plein écran, sans en-tête ni barre d'onglets. */
const BARE = ['/connexion', '/presentation'];

/** Pages ouvertes sans compte ni écran de connexion (liens publics exigés par le Play Store, page hors ligne). */
const PUBLIC = ['/connexion', '/presentation', '/conditions', '/confidentialite', '/aide', '/compte/supprimer', '/hors-ligne'];

export function Shell({ children }: { children: ReactNode }) {
  const { user, ready, guest } = useSession();
  const cart = useCart();
  const pathname = usePathname();
  const router = useRouter();
  const launching = useLaunching();
  const tabs = user ? TABS[user.role] : GUEST;
  const current = [...tabs].sort((a, b) => b.href.length - a.href.length).find(
    (t) => pathname === t.href || (t.href !== '/' && pathname.startsWith(t.href)),
  );

  // Application installée (écran d'accueil, plus tard les stores) ou simple onglet de navigateur : connu après
  // le premier rendu (null avant), l'écran de lancement couvre ce moment.
  const [app, setApp] = useState<boolean | null>(null);
  useEffect(() => setApp(isStandalone()), []);

  // Dans un navigateur, le site s'ouvre sur la présentation (avec « Installer l'application »), sauf pour un visiteur
  // connecté ou qui a déjà choisi d'utiliser le site (« Utiliser dans le navigateur », « Continuer sans compte »).
  const landing = ready && app === false && pathname === '/' && !user && !guest && !prefersWeb();
  useEffect(() => { if (landing) router.replace('/presentation'); }, [landing, router]);

  // Sans compte (première ouverture, ou après une déconnexion), l'application s'ouvre sur l'écran de connexion,
  // sauf si le visiteur a choisi « Continuer sans compte ».
  const open = PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const mustLogin = ready && app !== null && !user && !guest && !open && !landing;
  // L'écran de lancement ne dure un instant de plus que dans l'application installée, pas sur le site.
  const waiting = launching && app !== false;
  useEffect(() => {
    if (mustLogin && !waiting) {
      // Après la connexion, retour à la page demandée (lien de notification, par exemple), sauf accueil et profil.
      const back = pathname !== '/' && pathname !== '/profil';
      router.replace(back ? `/connexion?next=${encodeURIComponent(pathname)}` : '/connexion');
    }
  }, [mustLogin, waiting, pathname, router]);

  if (!open && (!ready || app === null || waiting || mustLogin || landing)) return <><Splash /><ServiceWorker /></>;

  if (BARE.includes(pathname)) return <>{children}<ServiceWorker /></>;

  // Les espaces fournisseur et admin affichent leur propre en-tête violet ; le client garde une barre légère.
  // Pages d'achat : barre « Voir le panier » flottante (pas pour les comptes vendeur ou admin).
  const shopping = (!user || user.role === 'CLIENT') && (pathname === '/' || pathname.startsWith('/depot/'));
  const ownHeader = pathname === '/' || pathname.startsWith('/fournisseur') || pathname.startsWith('/admin')
    || pathname.startsWith('/produit/') || pathname.startsWith('/depot/');

  return (
    <>
      {!ownHeader && (
        <header className="appbar">
          <div className="appbar-in">
            <Logo size={36} />
            {user ? <Bell /> : <Link className="pill-link" href="/connexion">Se connecter</Link>}
          </div>
        </header>
      )}
      <main className="page">
        <OfflineNotice />
        {children}
        {shopping && <CartBar />}
      </main>
      <nav className="tabbar" aria-label="Navigation principale">
        <div className="tabbar-in">
          {tabs.map((t) => (
            <Link key={t.href} href={t.href} aria-current={current?.href === t.href ? 'page' : undefined}
              aria-label={t.href === '/panier' && cart.count > 0 ? `Panier, ${cart.count} article${cart.count > 1 ? 's' : ''}` : undefined}>
              <span className="tab-icon">
                <Icon name={t.icon} size={22} />
                {t.href === '/panier' && cart.count > 0 && <span className="tab-badge" aria-hidden="true">{cart.count > 99 ? '99+' : cart.count}</span>}
              </span>
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
      <ServiceWorker />
    </>
  );
}

/**
 * En-tête violet des espaces fournisseur et administration. Placé en haut de la page, il déborde des marges
 * pour occuper toute la largeur de l'écran.
 */
export function HeroHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="night hero-head" style={{ margin: '-20px -16px 0' }}>
      <div className="hero-head-in">
        <div className="split">
          <Logo light size={32} href={null} />
        </div>
        <p className="hero-title" style={{ marginTop: 16 }}>{title}</p>
        {subtitle && <p className="hero-sub">{subtitle}</p>}
        {children}
      </div>
    </div>
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
        <p>Retournez à l’accueil pour continuer.</p>
        <Link className="btn btn-quiet" href="/">Aller à l’accueil</Link>
      </div>
    );
  }
  return <>{children}</>;
}
