'use client';
import { FormEvent, useEffect, useState } from 'react';
import { api, errorText } from '@/lib/api';
import { dateTime } from '@/lib/format';
import { Rating, Review } from '@/lib/types';
import { Notice } from './ui';

const ratingText = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Étoiles en lecture seule (★★★★☆), avec un texte pour les lecteurs d'écran. */
export function Stars({ value, size = '1rem' }: { value: number; size?: string }) {
  const full = Math.round(value);
  return (
    <span className="stars" style={{ fontSize: size }} role="img" aria-label={`${ratingText(value)} sur 5`}>
      {'★'.repeat(full)}<span className="stars-off">{'★'.repeat(5 - full)}</span>
    </span>
  );
}

/** Note d'un dépôt : « ★ 4,6 (23 avis) », ou « Nouveau » sous 3 avis. */
export function RatingBadge({ rating, long = false }: { rating?: Rating; long?: boolean }) {
  if (!rating || rating.average === null) {
    return <span className="rating rating-new">{long && rating?.count ? `Nouveau · ${rating.count} avis` : 'Nouveau'}</span>;
  }
  return (
    <span className="rating" aria-label={`Note ${ratingText(rating.average)} sur 5, ${rating.count} avis`}>
      <span className="rating-star" aria-hidden="true">★</span>{ratingText(rating.average)}
      <span className="muted"> ({rating.count}{long ? ' avis' : ''})</span>
    </span>
  );
}

/** Choix de la note : cinq boutons de 44 px, au clavier comme au doigt. */
export function StarInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const LABELS = ['Très mauvais', 'Mauvais', 'Correct', 'Bien', 'Excellent'];
  return (
    <div className="star-input" role="radiogroup" aria-label="Votre note">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} étoile${n > 1 ? 's' : ''}, ${LABELS[n - 1]}`}
          className={n <= value ? 'on' : ''} onClick={() => onChange(n)}>★</button>
      ))}
      {value > 0 && <span className="small muted">{LABELS[value - 1]}</span>}
    </div>
  );
}

/** Un avis : note, auteur (« Awa T. »), date, commentaire et réponse éventuelle du dépôt. */
export function ReviewItem({ review, storeName }: { review: Review; storeName?: string }) {
  return (
    <article className="review stack-sm">
      <div className="split">
        <span><Stars value={review.rating} /> <strong>{review.author}</strong></span>
        <span className="small muted">{dateTime(review.createdAt)}</span>
      </div>
      {review.comment && <p style={{ margin: 0 }}>{review.comment}</p>}
      {review.reply && (
        <p className="review-reply small">
          <strong>Réponse{storeName ? ` de ${storeName}` : ' du dépôt'}</strong> {review.reply}
        </p>
      )}
    </article>
  );
}

/** Section « Avis » de la page d'un dépôt. */
export function StoreReviews({ storeId, storeName }: { storeId: string; storeName: string }) {
  const [data, setData] = useState<{ rating: Rating; reviews: Review[] } | null>(null);
  useEffect(() => {
    api<{ rating: Rating; reviews: Review[] }>(`/stores/${storeId}/reviews`).then(setData).catch(() => setData(null));
  }, [storeId]);
  if (!data) return null;
  return (
    <section className="stack-sm" aria-labelledby="avis">
      <div className="split">
        <h2 id="avis">Avis</h2>
        <RatingBadge rating={data.rating} long />
      </div>
      {data.reviews.length === 0 ? (
        <p className="muted">Pas encore d’avis : les clients notent le dépôt après la remise de leur commande.</p>
      ) : (
        <div className="card rows-flat" style={{ paddingTop: 4, paddingBottom: 4 }}>
          {data.reviews.map((r) => <ReviewItem key={r.id} review={r} storeName={storeName} />)}
        </div>
      )}
    </section>
  );
}

/**
 * Carte « Noter ce dépôt » d'une commande terminée : donner ou modifier sa note (30 jours après la remise ; l'API
 * refuse ensuite avec un message clair).
 */
export function OrderReview({ orderId, storeName, review, onSaved }: {
  orderId: string; storeName: string; review?: { rating: number; comment: string | null; reply: string | null; hidden?: boolean } | null;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(!review);
  const [rating, setRating] = useState(review?.rating ?? 0);
  const [comment, setComment] = useState(review?.comment ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api(`/orders/${orderId}/review`, { method: 'PUT', body: { rating, comment: comment.trim() || undefined } });
      setEditing(false);
      onSaved();
    } catch (err) { setError(errorText(err)); }
    finally { setBusy(false); }
  }

  if (review && !editing) {
    return (
      <section className="card stack-sm" aria-labelledby="mon-avis">
        <h2 id="mon-avis">Votre avis sur {storeName}</h2>
        <Stars value={review.rating} size="1.3rem" />
        {review.comment && <p style={{ margin: 0 }}>{review.comment}</p>}
        {review.hidden && <p className="small muted">Cet avis a été masqué par l’équipe iGaz.</p>}
        {review.reply && <p className="review-reply small"><strong>Réponse du dépôt</strong> {review.reply}</p>}
        <button className="btn btn-quiet btn-small" style={{ alignSelf: 'flex-start' }} onClick={() => setEditing(true)}>Modifier mon avis</button>
      </section>
    );
  }

  return (
    <form className="card stack-sm" onSubmit={save} aria-labelledby="noter">
      <h2 id="noter">Noter {storeName}</h2>
      <p className="small muted" style={{ margin: 0 }}>Votre note aide les autres clients à choisir leur dépôt.</p>
      <StarInput value={rating} onChange={setRating} />
      <label className="field">
        <span className="label">Commentaire (facultatif)</span>
        <textarea className="input" maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)}
          placeholder="Rapidité, accueil, état de la bouteille…" />
      </label>
      <p className="small muted" style={{ margin: 0 }}>Votre avis est public, signé de votre prénom et de l’initiale de votre nom.</p>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="cluster">
        <button className="btn" disabled={busy || rating === 0}>{review ? 'Enregistrer' : 'Publier mon avis'}</button>
        {review && <button type="button" className="btn btn-quiet" onClick={() => setEditing(false)}>Annuler</button>}
      </div>
    </form>
  );
}
