'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import { Guard, HeroHeader } from '@/components/Shell';
import { Empty, Loading, Notice, SectionHead } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { AUDIT_LABEL as ACTION_LABEL, dateTime, fcfa, phoneFmt } from '@/lib/format';
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

interface Log { id: string; action: string; createdAt: string; actor: { phone: string } | null }

/** 1 250 → « 1,3 k » pour les tuiles ; en dessous de 1 000, le nombre exact. */
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k` : String(n));

function Overview() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [logs, setLogs] = useState<Log[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Stats>('/admin/stats').then(setStats).catch((e) => setError(errorText(e)));
    api<Supplier[]>('/admin/suppliers').then(setSuppliers).catch((e) => setError(errorText(e)));
    api<Log[]>('/admin/audit-logs?limit=4').then(setLogs).catch(() => setLogs([]));
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

  const totalOrders = Object.values(stats.orders).reduce((a, b) => a + b, 0);
  const statusRows = (Object.keys(stats.orders) as OrderStatus[]).filter((k) => stats.orders[k] > 0);
  const maxStatus = Math.max(1, ...statusRows.map((k) => stats.orders[k]));

  return (
    <div className="stack-lg">
      <HeroHeader title="Administration" subtitle="Bonjour ! Voici la vue d’ensemble.">
        <div className="stats">
          <div className="stat"><span className="num">{compact(stats.clients)}</span><span className="stat-label">Clients</span></div>
          <div className="stat"><span className="num">{compact(stats.suppliers.APPROVED ?? 0)}</span><span className="stat-label">Fournisseurs</span></div>
          <div className="stat"><span className="num">{compact(totalOrders)}</span><span className="stat-label">Commandes</span></div>
        </div>
      </HeroHeader>
      {error && <Notice kind="error">{error}</Notice>}

      <Link className="card card-link split" href="/admin/revenus">
        <span className="cluster" style={{ gap: 10, fontWeight: 800 }}><Icon name="wallet" size={22} />Revenus et relevés des dépôts</span>
        <Icon name="chevron" size={20} />
      </Link>
      <Link className="card card-link split" href="/admin/avis">
        <span className="cluster" style={{ gap: 10, fontWeight: 800 }}><Icon name="star" size={22} />Avis des clients</span>
        <Icon name="chevron" size={20} />
      </Link>

      <section className="stack-sm" aria-labelledby="activite">
        <SectionHead id="activite" title="Activité récente" more={{ href: '/admin/audit' }} />
        <div className="card rows-flat" style={{ paddingTop: 4, paddingBottom: 4 }}>
          {logs === null ? <Loading /> : logs.length === 0 ? <p className="muted" style={{ padding: '12px 0' }}>Aucune action pour l’instant.</p> : logs.map((l) => (
            <div key={l.id} className="activity">
              <span className="activity-icon"><Icon name={l.action.startsWith('SUPPLIER') ? 'store' : l.action.startsWith('STOCK') ? 'alert' : l.action.startsWith('ORDER') ? 'orders' : 'journal'} size={20} /></span>
              <span style={{ minWidth: 0 }}>
                <strong style={{ display: 'block' }}>{ACTION_LABEL[l.action] ?? l.action}</strong>
                <span className="small muted">{dateTime(l.createdAt)}{l.actor ? `, ${phoneFmt(l.actor.phone)}` : ''}</span>
              </span>
              <Icon name="chevron" size={18} />
            </div>
          ))}
        </div>
      </section>

      <section className="dark-card stack-sm" aria-label="Ventes et commandes">
        <span style={{ opacity: 0.85 }}>Ventes terminées</span>
        <span className="num">{fcfa(stats.completedVolume)}</span>
        <div className="stack-sm" style={{ marginTop: 10 }}>
          {statusRows.map((k) => (
            <div key={k} className="small">
              <div className="split" style={{ opacity: 0.9 }}><span>Commandes {ORDER_PLURAL[k]}</span><strong>{stats.orders[k]}</strong></div>
              <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.12)', marginTop: 4 }}>
                <div style={{ height: 6, borderRadius: 3, width: `${(stats.orders[k] / maxStatus) * 100}%`, background: 'linear-gradient(90deg, #7c5cff, #f7931e)' }} />
              </div>
            </div>
          ))}
          <p className="small" style={{ opacity: 0.7 }}>{stats.stores} boutiques, {stats.suppliers.PENDING ?? 0} demandes à valider, {stats.suppliers.SUSPENDED ?? 0} fournisseurs suspendus.</p>
        </div>
      </section>

      <section className="stack-sm" aria-labelledby="valider">
        <h2 id="valider">Demandes à valider <span className="muted">({pending.length})</span></h2>
        {pending.length === 0 ? <Empty title="Aucune demande en attente" /> : pending.map((s) => (
          <article key={s.id} className="card stack-sm">
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
          <div className="card rows-flat" style={{ paddingTop: 4, paddingBottom: 4 }}>
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
