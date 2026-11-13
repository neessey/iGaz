'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { Field, Notice } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { homeFor, useSession } from '@/lib/session';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { signIn } = useSession();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api<{ sent: boolean; devCode?: string }>('/auth/otp/request', { body: { phone } });
      setDevCode(r.devCode ?? null);
      setStep('code');
    } catch (err) {
      setError(errorText(err));
    } finally { setBusy(false); }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api<{ accessToken: string }>('/auth/otp/verify', { body: { phone, code } });
      const me = await signIn(r.accessToken);
      router.replace(params.get('next') ?? homeFor(me.role));
    } catch (err) {
      setError(errorText(err));
    } finally { setBusy(false); }
  }

  return (
    <div className="stack-lg">
      <h1>Se connecter</h1>
      {step === 'phone' ? (
        <form className="stack" onSubmit={requestCode}>
          <Field label="Votre numéro de téléphone" hint="Nous vous envoyons un code par SMS. Pas de mot de passe à retenir.">
            <input className="input" inputMode="tel" autoComplete="tel" placeholder="07 01 02 03 04"
              value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </Field>
          {error && <Notice kind="error">{error}</Notice>}
          <button className="btn btn-block" disabled={busy || phone.trim().length < 8}>Recevoir le code</button>
        </form>
      ) : (
        <form className="stack" onSubmit={verify}>
          <Field label={`Code reçu au ${phone}`} hint="Le code expire au bout de 5 minutes.">
            <input className="input input-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus />
          </Field>
          {devCode && <Notice>Mode démonstration : le code est {devCode}</Notice>}
          {error && <Notice kind="error">{error}</Notice>}
          <button className="btn btn-block" disabled={busy || code.length !== 6}>Valider le code</button>
          <button type="button" className="btn btn-quiet btn-block" onClick={() => { setStep('phone'); setCode(''); setError(null); }}>
            Changer de numéro
          </button>
        </form>
      )}
    </div>
  );
}

export default function Page() {
  return <Suspense><LoginForm /></Suspense>;
}
