'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { RatingBadge, ReviewItem } from '@/components/Reviews';
import { Guard } from '@/components/Shell';
import { Empty, Loading, Notice, PageHead } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { Rating, Review } from '@/lib/types';

/** Réponse publique du dépôt à un avis : une seule fois. */
function ReplyForm({ storeId, review, onDone }: { storeId: string; review: Review; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true); setError(null);
    try {
      await api(`/stores/${storeId}/reviews/${review.id}/reply`, { method: 'PUT', body: { reply: text } });
      onDone();
    } catch (e) { setError(errorText(e)); setBusy(false); }
  }

  if (!open) return <button className="btn btn-quiet btn-small" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>Répondre</button>;
  return (
    <div className="stack-sm">
      <label className="field">
        <span className="label">Votre réponse (publique, une seule fois)</span>
        <textarea className="input" maxLength={500} value={text} onChange={(e) => setText(e.target.value)} placeholder="Merci pour votre commande…" />
      </label>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="cluster">
        <button className="btn btn-small" disabled={busy || text.trim().length < 2} onClick={send}>Publier la réponse</button>
        <button className="btn btn-quiet btn-small" onClick={() => setOpen(false)}>Annuler</button>
      </div>
    </div>
  );
}

function Avis() {
  const [store, setStore] = useState<{ id: string; name: string } | null | undefined>(undefined);
  const [data, setData] = useState<{ rating: Rating; reviews: Review[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ id: string; name: string }[]>('/suppliers/me/stores').then((s) => setStore(s[0] ?? null)).catch((e) => setError(errorText(e)));
  }, []);
  const load = useCallback(() => {
    if (store) api<{ rating: Rating; reviews: Review[] }>(`/stores/${store.id}/reviews/mine`).then(setData).catch((e) => setError(errorText(e)));
  }, [store]);
  useEffect(load, [load]);

  if (error) return <Notice kind="error">{error}</Notice>;
  if (store === undefined) return <Loading />;
  if (store === null) return (
    <div className="stack">
      <PageHead title="Avis des clients" back="/fournisseur" />
      <Empty title="Créez d’abord votre boutique" />
      <Link className="btn" href="/fournisseur/boutique">Créer ma boutique</Link>
    </div>
  );

  return (
    <div className="stack-lg">
      <div className="stack-sm">
        <PageHead title="Avis des clients" back="/fournisseur" />
        <p className="muted">{store.name}. Les clients notent votre dépôt après la remise. Une réponse aimable rassure les prochains clients.</p>
      </div>
      {!data ? <Loading /> : (
        <>
          <section className="card split" aria-label="Note du dépôt">
            <strong>Votre note</strong>
            <RatingBadge rating={data.rating} long />
          </section>
          {data.rating.average === null && <p className="small muted">La moyenne s’affiche aux clients à partir de 3 avis.</p>}
          {data.reviews.length === 0 ? <Empty title="Pas encore d’avis" /> : (
            <div className="rows">
              {data.reviews.map((r) => (
                <div key={r.id} className="card stack-sm">
                  <ReviewItem review={r} />
                  <p className="small muted" style={{ margin: 0 }}>Commande #{r.order?.code}</p>
                  {r.hidden && <p className="small" style={{ color: 'var(--red)', margin: 0 }}>Masqué par l’équipe iGaz : invisible pour les clients, hors de votre moyenne.</p>}
                  {!r.reply && !r.hidden && <ReplyForm storeId={store.id} review={r} onDone={load} />}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function Page() {
  return <Guard roles={['SUPPLIER']}><Avis /></Guard>;
}
