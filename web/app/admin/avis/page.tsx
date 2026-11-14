'use client';
import { useCallback, useEffect, useState } from 'react';
import { ReviewItem } from '@/components/Reviews';
import { Guard } from '@/components/Shell';
import { Empty, Loading, Notice, PageHead } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { Review } from '@/lib/types';

type AdminReview = Review & { hidden: boolean; store: { id: string; name: string }; order: { code: string } };

/** Masquer un avis abusif (insulte, numéro de téléphone…) ou le réafficher : journal d'audit, moyenne corrigée. */
function Row({ review, onChange }: { review: AdminReview; onChange: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true); setError(null);
    try {
      await api(`/admin/reviews/${review.id}`, { method: 'PATCH', body: { hidden: !review.hidden, reason: reason.trim() || undefined } });
      onChange();
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="card stack-sm" style={{ opacity: review.hidden ? 0.7 : 1 }}>
      <p className="small muted" style={{ margin: 0 }}><strong>{review.store.name}</strong> · commande #{review.order.code}</p>
      <ReviewItem review={review} />
      {review.hidden && <span className="badge badge-wait" style={{ alignSelf: 'flex-start' }}>Masqué</span>}
      {!review.hidden && (
        <input className="input" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)}
          placeholder="Motif du masquage (ex. insulte, numéro de téléphone)" aria-label="Motif du masquage" />
      )}
      {error && <Notice kind="error">{error}</Notice>}
      <button className={`btn btn-small ${review.hidden ? 'btn-quiet' : 'btn-danger'}`} style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={toggle}>
        {review.hidden ? 'Réafficher l’avis' : 'Masquer l’avis'}
      </button>
    </div>
  );
}

function AdminAvis() {
  const [hiddenOnly, setHiddenOnly] = useState(false);
  const [list, setList] = useState<AdminReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    api<AdminReview[]>(`/admin/reviews${hiddenOnly ? '?hidden=true' : ''}`).then(setList).catch((e) => setError(errorText(e)));
  }, [hiddenOnly]);
  useEffect(() => { setList(null); load(); }, [load]);

  return (
    <div className="stack-lg">
      <PageHead title="Avis des clients" back="/admin" />
      <div className="segmented" role="radiogroup" aria-label="Avis affichés">
        <button role="radio" aria-checked={!hiddenOnly} onClick={() => setHiddenOnly(false)}>Tous</button>
        <button role="radio" aria-checked={hiddenOnly} onClick={() => setHiddenOnly(true)}>Masqués</button>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {!list ? <Loading /> : list.length === 0 ? <Empty title={hiddenOnly ? 'Aucun avis masqué' : 'Pas encore d’avis'} /> : (
        <div className="rows">{list.map((r) => <Row key={r.id} review={r} onChange={load} />)}</div>
      )}
    </div>
  );
}

export default function Page() {
  return <Guard roles={['ADMIN']}><AdminAvis /></Guard>;
}
