'use client';
import { useCallback, useEffect, useState } from 'react';
import { Guard } from '@/components/Shell';
import { Empty, Loading, Notice } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { dateTime, fcfa, phoneFmt } from '@/lib/format';
import { OrderStatus } from '@/lib/types';

interface Stats {
  clients: number; stores: number; completedVolume: number;
  suppliers: Record<string, number>; orders: Record<string, number>;
}
type SupplierStatus = 'PENDING' | 'APPROVED' | 'SUSPENDED' | 'REJECTED';
interface Supplier {
  id: string; businessName: string; status: SupplierStatus; createdAt: string;
  user: { phone: string; name: string | null }; documents: { id: string; type: string; url: string }[];
}

const ORDER_PLURAL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'en attente de paiement', SUBMITTED: 'à accepter', ACCEPTED: 'acceptées', READY_FOR_PICKUP: 'prêtes au retrait',
  OUT_FOR_DELIVERY: 'en livraison', COMPLETED: 'terminées', REJECTED: 'refusées', CANCELLED: 'annulées',
};

const SUPPLIER_LABEL: Record<SupplierStatus, string> = {
  PENDING: 'À valider', APPROVED: 'Actifs', SUSPENDED: 'Suspendus', REJECTED: 'Refusés',
};

function Overview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Stats>('/admin/stats').then(setStats).catch((e) => setError(errorText(e)));
    api<Supplier[]>('/admin/suppliers').then(setSuppliers).catch((e) => setError(errorText(e)));
  }, []);
  useEffect(load, [load]);

  async function act(id: string, action: 'approve' | 'reject' | 'suspend') {
    setBusyId(id); setError(null);
    try { await api(`/admin/suppliers/${id}/${action}`, { method: 'POST', body: {} }); load(); }
    catch (e) { setError(errorText(e)); }
    finally { setBusyId(null); }
  }

  if (!stats || !suppliers) return error ? <Notice kind="error">{error}</Notice> : <Loading />;

  const pending = suppliers.filter((s) => s.status === 'PENDING');
  const others = suppliers.filter((s) => s.status !== 'PENDING');

  return (
    <div className="stack-lg">
      <h1>Vue d’ensemble</h1>
      {error && <Notice kind="error">{error}</Notice>}

      <section className="stack-sm" aria-labelledby="chiffres">
        <h2 id="chiffres">Chiffres du moment</h2>
        <div className="panel">
          <dl className="facts">
            <dt>Clients inscrits</dt><dd className="num">{stats.clients}</dd>
            <dt>Boutiques</dt><dd className="num">{stats.stores}</dd>
            {(Object.keys(SUPPLIER_LABEL) as SupplierStatus[]).map((k) => (
              <div key={k} style={{ display: 'contents' }}><dt>Fournisseurs {SUPPLIER_LABEL[k].toLowerCase()}</dt><dd className="num">{stats.suppliers[k] ?? 0}</dd></div>
            ))}
            {(Object.keys(stats.orders) as OrderStatus[]).map((k) => (
              <div key={k} style={{ display: 'contents' }}><dt>Commandes {ORDER_PLURAL[k]}</dt><dd className="num">{stats.orders[k]}</dd></div>
            ))}
            <dt className="total">Ventes terminées</dt><dd className="total num">{fcfa(stats.completedVolume)}</dd>
          </dl>
        </div>
      </section>

      <section className="stack-sm" aria-labelledby="valider">
        <h2 id="valider">Demandes à valider <span className="muted">({pending.length})</span></h2>
        {pending.length === 0 ? <Empty title="Aucune demande en attente" /> : pending.map((s) => (
          <article key={s.id} className="panel panel-warn stack-sm">
            <div className="split"><strong>{s.businessName}</strong><span className="small muted">{dateTime(s.createdAt)}</span></div>
            <p className="small">{s.user.name ?? 'Sans nom'}, {phoneFmt(s.user.phone)}</p>
            {s.documents.length > 0
              ? <ul className="small" style={{ margin: 0, paddingLeft: 20 }}>{s.documents.map((d) => <li key={d.id}><a href={d.url} target="_blank" rel="noreferrer">{d.type}</a></li>)}</ul>
              : <p className="small muted">Aucun document joint.</p>}
            <p className="small muted">Vérifiez les autorisations avant de valider : la validation iGaz ne remplace pas les autorisations légales.</p>
            <div className="cluster">
              <button className="btn" disabled={busyId === s.id} onClick={() => act(s.id, 'approve')}>Valider</button>
              <button className="btn btn-danger" disabled={busyId === s.id} onClick={() => act(s.id, 'reject')}>Refuser</button>
            </div>
          </article>
        ))}
      </section>

      <section className="stack-sm" aria-labelledby="tous">
        <h2 id="tous">Tous les fournisseurs</h2>
        {others.length === 0 ? <Empty title="Aucun fournisseur pour l’instant" /> : (
          <div className="rows">
            {others.map((s) => (
              <div key={s.id} className="split">
                <span><strong>{s.businessName}</strong><span className="small muted" style={{ display: 'block' }}>{phoneFmt(s.user.phone)}, {SUPPLIER_LABEL[s.status].toLowerCase()}</span></span>
                {s.status === 'APPROVED' && <button className="btn btn-danger btn-small" disabled={busyId === s.id} onClick={() => act(s.id, 'suspend')}>Suspendre</button>}
                {s.status === 'SUSPENDED' && <button className="btn btn-quiet btn-small" disabled={busyId === s.id} onClick={() => act(s.id, 'approve')}>Réactiver</button>}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function Page() {
  return <Guard roles={['ADMIN']}><Overview /></Guard>;
}
