'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon, IconName } from '@/components/Icon';
import { Guard } from '@/components/Shell';
import { Empty, Loading, Notice, PageHead } from '@/components/ui';
import { errorText } from '@/lib/api';
import { AppNotification, disablePush, enablePush, pushState, PushState, useNotifications } from '@/lib/notifications';

const ICON: Record<string, IconName> = {
  ORDER_NEW: 'orders', ORDER_ACCEPTED: 'check', ORDER_READY: 'store', ORDER_OUT: 'truck',
  ORDER_COMPLETED: 'shield', ORDER_REJECTED: 'alert', ORDER_CANCELLED: 'alert',
};

/** « il y a 5 min », « hier à 14:05 »… (heure d'Abidjan = UTC). */
function when(iso: string) {
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  if (min < 24 * 60) return `il y a ${Math.round(min / 60)} h`;
  return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}

/** Carte d'activation des notifications sur le téléphone. */
function PushCard() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { pushState().then(setState).catch(() => setState('unsupported')); }, []);

  async function run(fn: () => Promise<PushState>) {
    setBusy(true); setError(null);
    try { setState(await fn()); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  if (state === null) return null;
  const text: Record<PushState, string> = {
    on: 'Les notifications sont activées sur ce téléphone.',
    off: 'Soyez prévenu sur votre téléphone, même quand l’application est fermée.',
    denied: 'Les notifications sont bloquées pour iGaz. Autorisez-les dans les réglages du téléphone, puis revenez ici.',
    'not-installed': 'Installez l’application iGaz (ou ouvrez la version publiée) pour recevoir les notifications sur ce téléphone.',
    'not-configured': 'Les notifications sur téléphone ne sont pas encore activées par iGaz. Elles restent visibles ici.',
    unsupported: 'Ce navigateur ne permet pas les notifications. Elles restent visibles ici.',
  };
  return (
    <section className={`panel ${state === 'on' ? 'panel-ok' : 'panel-flag'} stack-sm`} aria-label="Notifications sur le téléphone">
      <strong className="cluster" style={{ gap: 8 }}><Icon name="bell" size={20} />Sur ce téléphone</strong>
      <p>{text[state]}</p>
      {error && <Notice kind="error">{error}</Notice>}
      {state === 'off' && <button className="btn" disabled={busy} onClick={() => run(enablePush)}>Activer les notifications</button>}
      {state === 'on' && <button className="btn btn-quiet btn-small" disabled={busy} onClick={() => run(disablePush)}>Désactiver sur ce téléphone</button>}
    </section>
  );
}

function NotificationsList() {
  const router = useRouter();
  const { items, unread, reload, markRead, markAllRead } = useNotifications();
  useEffect(() => { reload(); }, [reload]);

  function open(n: AppNotification) {
    if (!n.readAt) markRead(n.id);
    if (n.url) router.push(n.url);
  }

  return (
    <div className="stack-lg">
      <PageHead title="Notifications" action={unread > 0
        ? <button className="link-more" style={{ border: 0, background: 'none', cursor: 'pointer' }} onClick={markAllRead}>Tout marquer comme lu</button>
        : undefined} />
      <PushCard />
      {items === null ? <Loading /> : items.length === 0 ? (
        <Empty title="Aucune notification pour l’instant">Vous serez prévenu ici à chaque étape de vos commandes.</Empty>
      ) : (
        <div className="card rows-flat" style={{ paddingTop: 4, paddingBottom: 4 }}>
          {items.map((n) => (
            <button key={n.id} className={`notif${n.readAt ? '' : ' unread'}`} onClick={() => open(n)}>
              <span className="activity-icon"><Icon name={ICON[n.kind] ?? 'bell'} size={20} /></span>
              <span style={{ minWidth: 0 }}>
                <strong style={{ display: 'block' }}>{n.title}</strong>
                <span className="small">{n.body}</span>
                <span className="small muted" style={{ display: 'block', marginTop: 2 }}>{when(n.createdAt)}</span>
              </span>
              {!n.readAt && <span className="notif-dot" aria-label="Non lue" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Page() {
  return <Guard roles={['CLIENT', 'SUPPLIER', 'ADMIN']}><NotificationsList /></Guard>;
}
