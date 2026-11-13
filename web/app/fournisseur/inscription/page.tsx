'use client';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Guard } from '@/components/Shell';
import { Field, Notice, PageHead } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { useSession } from '@/lib/session';

function Register() {
  const router = useRouter();
  const { refresh } = useSession();
  const [businessName, setBusinessName] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api('/suppliers/register', {
        body: { businessName, ...(docUrl ? { documents: [{ type: 'Autorisation de distribution', url: docUrl }] } : {}) },
      });
      await refresh();
      router.replace('/fournisseur');
    } catch (err) { setError(errorText(err)); setBusy(false); }
  }

  return (
    <div className="stack-lg">
      <div className="stack-sm">
        <PageHead title="Ouvrir ma boutique" back="/profil" />
        <p className="muted">Vous vendez ou livrez des bouteilles de gaz à Abidjan&nbsp;? Dites-nous qui vous êtes. Notre équipe valide votre demande avant que vos produits n’apparaissent.</p>
      </div>
      <form className="card stack" onSubmit={submit}>
        <Field label="Nom de votre dépôt ou de votre société">
          <input className="input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required minLength={2} />
        </Field>
        <Field label="Lien vers votre autorisation de distribution (facultatif)" hint="Photo ou PDF hébergé en ligne. Votre inscription sur iGaz ne remplace pas vos autorisations légales.">
          <input className="input" type="url" inputMode="url" value={docUrl} onChange={(e) => setDocUrl(e.target.value)} placeholder="https://" />
        </Field>
        {error && <Notice kind="error">{error}</Notice>}
        <button className="btn btn-block" disabled={busy || businessName.trim().length < 2}>Envoyer ma demande</button>
      </form>
    </div>
  );
}

export default function Page() {
  return <Guard roles={['CLIENT', 'SUPPLIER']}><Register /></Guard>;
}
