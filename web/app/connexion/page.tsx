'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { Logo, LogoMark } from '@/components/Logo';
import { Field, Notice } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { IMAGES } from '@/lib/media';
import { homeFor, useSession } from '@/lib/session';

type Step = 'welcome' | 'phone' | 'code' | 'name';

/** Même règle que l'API : lettres (accents compris), espaces, tirets, apostrophes ; 40 caractères au plus. */
const NAME_OK = /^\p{L}[\p{L}' -]{0,39}$/u;
const nameOk = (s: string) => NAME_OK.test(s.trim().replace(/\s+/g, ' '));

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, ready, signIn, refresh, continueAsGuest } = useSession();
  // Toujours l'écran d'accueil d'abord (première ouverture, déconnexion, page réservée) ; « next » sert après la connexion.
  const [step, setStep] = useState<Step>('welcome');
  const [signup, setSignup] = useState(false);
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [destination, setDestination] = useState('/');

  const namesValid = nameOk(firstName) && nameOk(lastName);

  // Déjà connecté (application rouverte sur cette page) : direction l'accueil du compte.
  useEffect(() => {
    if (ready && user && step === 'welcome') router.replace(params.get('next') ?? homeFor(user.role));
  }, [ready, user, step, router, params]);

  async function requestCode(e: FormEvent) {
    e.preventDefault();
    if (signup && !namesValid) { setError('Indiquez votre prénom et votre nom (lettres, espaces, tirets ou apostrophes).'); return; }
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
      const r = await api<{ accessToken: string }>('/auth/otp/verify', {
        body: { phone, code, ...(signup ? { firstName: firstName.trim(), lastName: lastName.trim() } : {}) },
      });
      const me = await signIn(r.accessToken);
      const next = params.get('next') ?? homeFor(me.role);
      // Compte sans nom (ancien compte, ou première connexion par « Se connecter ») : on le demande maintenant.
      if (!me.name?.trim()) { setDestination(next); setStep('name'); return; }
      router.replace(next);
    } catch (err) {
      setError(errorText(err));
    } finally { setBusy(false); }
  }

  async function saveName(e: FormEvent) {
    e.preventDefault();
    if (!namesValid) { setError('Indiquez votre prénom et votre nom (lettres, espaces, tirets ou apostrophes).'); return; }
    setBusy(true); setError(null);
    try {
      await api('/auth/me', { method: 'PATCH', body: { firstName: firstName.trim(), lastName: lastName.trim() } });
      await refresh();
      router.replace(destination);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  const nameFields = (
    <div className="name-grid">
      <Field label="Prénom">
        <input className="input" autoComplete="given-name" autoCapitalize="words" maxLength={40}
          value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
      </Field>
      <Field label="Nom">
        <input className="input" autoComplete="family-name" autoCapitalize="words" maxLength={40}
          value={lastName} onChange={(e) => setLastName(e.target.value)} required />
      </Field>
    </div>
  );

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
              <div style={{ textAlign: 'center' }}>
                <button type="button" className="text-btn" onClick={() => { continueAsGuest(); router.replace('/'); }}>
                  Continuer sans compte
                </button>
              </div>
            </div>
          </>
        ) : step === 'phone' ? (
          <form className="stack" onSubmit={requestCode} style={{ marginTop: 'auto' }}>
            <h1>{signup ? 'Créer un compte' : 'Se connecter'}</h1>
            {signup && nameFields}
            <Field label="Votre numéro de téléphone" hint={signup
              ? 'Votre compte est créé dès que vous saisissez le code reçu par SMS. Pas de mot de passe.'
              : 'Nous vous envoyons un code par SMS. Pas de mot de passe à retenir.'}>
              <input className="input" inputMode="tel" autoComplete="tel" placeholder="07 01 02 03 04"
                value={phone} onChange={(e) => setPhone(e.target.value)} required autoFocus={!signup} />
            </Field>
            {error && <Notice kind="error">{error}</Notice>}
            <button className="btn btn-block" disabled={busy || phone.trim().length < 8 || (signup && !namesValid)}>Recevoir le code</button>
            <p className="small" style={{ opacity: 0.85, textAlign: 'center', margin: '0 auto' }}>
              En continuant, vous acceptez les <Link href="/conditions">conditions d’utilisation</Link> et
              la <Link href="/confidentialite">politique de confidentialité</Link>.
            </p>
            <button type="button" className="text-btn" onClick={() => { setStep('welcome'); setError(null); }}>Retour</button>
          </form>
        ) : step === 'name' ? (
          <form className="stack" onSubmit={saveName} style={{ marginTop: 'auto' }}>
            <h1>Comment vous appelez-vous&nbsp;?</h1>
            <p style={{ opacity: 0.85 }}>Votre nom permet au dépôt de savoir qui il livre. Vous pourrez le modifier dans votre profil.</p>
            {nameFields}
            {error && <Notice kind="error">{error}</Notice>}
            <button className="btn btn-block" disabled={busy || !namesValid}>Continuer</button>
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
