'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { Logo, LogoMark } from '@/components/Logo';
import { Field, Notice } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { IMAGES } from '@/lib/media';
import { homeFor, useSession } from '@/lib/session';

type Step = 'welcome' | 'phone' | 'code';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { signIn } = useSession();
  // Arrivé ici depuis une page réservée : on passe directement au numéro.
  const [step, setStep] = useState<Step>(params.get('next') ? 'phone' : 'welcome');
  const [signup, setSignup] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
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

  const start = (isSignup: boolean) => { setSignup(isSignup); setStep('phone'); setError(null); };

  return (
    <div className="welcome night">
      <div className="welcome-in">
        {(step !== 'welcome' || IMAGES.welcome) && (
          <div style={{ textAlign: 'center' }}>
            <Logo light size={44} tagline href="/" />
          </div>
        )}

        {step === 'welcome' ? (
          <>
            <div className="welcome-art">
              {IMAGES.welcome ? <img src={IMAGES.welcome} alt="" /> : (
                <div className="stack" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                  <LogoMark size={150} large />
                  <h1 className="logo-word" style={{ fontSize: '2.6rem' }}>iGaz <span style={{ color: 'var(--orange)' }}>CI</span></h1>
                  <p style={{ opacity: 0.85, fontSize: '1.1rem', margin: '4px auto 0' }}>Le gaz, simplement.</p>
                </div>
              )}
            </div>
            <div className="stack-sm">
              <button className="btn btn-block" onClick={() => start(false)}>Se connecter</button>
              <button className="btn btn-ghost-light btn-block" onClick={() => start(true)}>Créer un compte</button>
              <div style={{ textAlign: 'center' }}><Link href="/" className="text-btn" style={{ display: 'inline-flex', alignItems: 'center' }}>Continuer sans compte</Link></div>
            </div>
          </>
        ) : step === 'phone' ? (
          <form className="stack" onSubmit={requestCode} style={{ marginTop: 'auto' }}>
            <h1>{signup ? 'Créer un compte' : 'Se connecter'}</h1>
            <Field label="Votre numéro de téléphone" hint={signup
              ? 'Votre compte est créé dès que vous saisissez le code reçu par SMS. Pas de mot de passe.'
              : 'Nous vous envoyons un code par SMS. Pas de mot de passe à retenir.'}>
              <input className="input" inputMode="tel" autoComplete="tel" placeholder="07 01 02 03 04"
                value={phone} onChange={(e) => setPhone(e.target.value)} required autoFocus />
            </Field>
            {error && <Notice kind="error">{error}</Notice>}
            <button className="btn btn-block" disabled={busy || phone.trim().length < 8}>Recevoir le code</button>
            <button type="button" className="text-btn" onClick={() => { setStep('welcome'); setError(null); }}>Retour</button>
          </form>
        ) : (
          <form className="stack" onSubmit={verify} style={{ marginTop: 'auto' }}>
            <h1>Code reçu par SMS</h1>
            <Field label={`Code envoyé au ${phone}`} hint="Le code expire au bout de 5 minutes.">
              <input className="input input-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus />
            </Field>
            {devCode && <Notice>Mode démonstration : le code est {devCode}</Notice>}
            {error && <Notice kind="error">{error}</Notice>}
            <button className="btn btn-block" disabled={busy || code.length !== 6}>Valider le code</button>
            <button type="button" className="text-btn" onClick={() => { setStep('phone'); setCode(''); setError(null); }}>
              Changer de numéro
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense><LoginForm /></Suspense>;
}
