'use client';
import { useEffect, useState } from 'react';
import { Guard } from '@/components/Shell';
import { Empty, Loading, Notice, PageHead } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { AUDIT_LABEL as ACTION_LABEL, dateTime, phoneFmt } from '@/lib/format';

interface Log {
  id: string; action: string; entity: string; entityId: string; createdAt: string;
  after: Record<string, unknown> | null; actor: { phone: string; name: string | null } | null;
}

function Audit() {
  const [logs, setLogs] = useState<Log[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { api<Log[]>('/admin/audit-logs?limit=100').then(setLogs).catch((e) => setError(errorText(e))); }, []);

  return (
    <div className="stack-lg">
      <div className="stack-sm">
        <PageHead title="Journal d’audit" back="/admin" />
        <p className="muted">Les 100 dernières actions de l’équipe iGaz. Rien ne s’efface ici.</p>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {!logs && !error && <Loading />}
      {logs?.length === 0 && <Empty title="Aucune action enregistrée" />}
      {logs && logs.length > 0 && (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Quand</th><th>Qui</th><th>Action</th><th>Détail</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td>{dateTime(l.createdAt)}</td>
                  <td>{l.actor ? phoneFmt(l.actor.phone) : 'Système'}</td>
                  <td>{ACTION_LABEL[l.action] ?? l.action}<span className="muted" style={{ display: 'block' }}>{l.entity}</span></td>
                  <td>{l.after ? Object.entries(l.after).filter(([, v]) => typeof v !== 'object').slice(0, 3).map(([k, v]) => `${k}: ${String(v)}`).join(', ') : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return <Guard roles={['ADMIN']}><Audit /></Guard>;
}
