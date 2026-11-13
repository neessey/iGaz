'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Fill } from '@/components/Todo';
import { Loading, Notice, PageHead } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { phoneFmt } from '@/lib/format';
import { COMPANY } from '@/lib/legal';
import { useSession } from '@/lib/session';

/**
 * Suppression de compte. Page publique : le Play Store exige un lien web qui explique la démarche, même sans
 * l'application. Connecté, l'utilisateur supprime son compte ici après confirmation.
 */
export default function DeleteAccount() {
  const { user, ready, signOut } = useSession();
  const cart = useCart();
  const router = useRouter();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function remove() {
    setBusy(true); setError(null);
    try {
      await api('/auth/me', { method: 'DELETE' });
      signOut();
      cart.clear();
      setDone(true);
    } catch (e) { setError(errorText(e)); setBusy(false); }
  }

  if (!ready) return <Loading />;

  if (done) {
    return (
      <div className="stack-lg">
        <PageHead title="Compte supprimé" />
        <Notice kind="ok">Votre compte iGaz est supprimé. Merci d’avoir utilisé iGaz.</Notice>
        <button className="btn btn-quiet btn-block" onClick={() => router.push('/')}>Retour à l’accueil</button>
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <PageHead title="Supprimer mon compte" back={user ? '/profil' : undefined} />

      <section className="card stack-sm prose">
        <h2 style={{ marginTop: 0 }}>Ce qui est supprimé</h2>
        <ul>
          <li>votre numéro de téléphone et votre nom ;</li>
          <li>vos adresses enregistrées ;</li>
          <li>les adresses de livraison inscrites dans vos anciennes commandes ;</li>
          <li>pour un vendeur : la boutique est fermée et n’apparaît plus aux clients.</li>
        </ul>
        <h2>Ce qui est conservé</h2>
        <p>
          Le détail de vos anciennes commandes (bouteilles, montants, dates) est conservé <strong>sans votre identité</strong>, pour la
          comptabilité des dépôts et nos obligations légales. Il n’est plus relié à aucun numéro.
        </p>
        <h2>À savoir</h2>
        <p>La suppression est définitive. Vous pourrez recréer un compte plus tard avec le même numéro : il repartira de zéro.
          Si une commande est en cours, terminez-la ou annulez-la d’abord.</p>
      </section>

      {!user ? (
        <section className="card stack-sm">
          <h2>Comment faire</h2>
          <p>Connectez-vous avec le numéro du compte à supprimer, puis revenez sur cette page (Profil, puis « Supprimer mon compte »).</p>
          <Link className="btn btn-block" href="/connexion?next=/compte/supprimer">Me connecter pour supprimer mon compte</Link>
          <p className="small muted">
            Vous n’avez plus accès à ce numéro ? Écrivez-nous à <Fill value={COMPANY.dataContact ?? COMPANY.email} label="e-mail de contact" />.
          </p>
        </section>
      ) : user.role === 'ADMIN' ? (
        <Notice>Un compte administrateur ne se supprime pas depuis l’application.</Notice>
      ) : (
        <section className="card stack-sm">
          <p>Compte : <strong>{phoneFmt(user.phone)}</strong></p>
          <label className="field">
            <span className="label">Pour confirmer, écrivez SUPPRIMER</span>
            <input className="input" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          {error && <Notice kind="error">{error}</Notice>}
          <button className="btn btn-danger btn-block" disabled={busy || confirm.trim().toUpperCase() !== 'SUPPRIMER'} onClick={remove}>
            {busy ? 'Suppression…' : 'Supprimer définitivement mon compte'}
          </button>
          <Link className="btn btn-quiet btn-block" href="/profil">Garder mon compte</Link>
        </section>
      )}
    </div>
  );
}
