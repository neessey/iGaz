'use client';
import Link from 'next/link';
import { useNotifications } from '@/lib/notifications';
import { Icon } from './Icon';

/** Cloche : ouvre les notifications, avec le nombre de non lues. `dark` : sur fond violet (espace vendeur). */
export function Bell({ dark = false }: { dark?: boolean }) {
  const { unread } = useNotifications();
  return (
    <Link href="/notifications" className={dark ? 'round-btn' : 'bell-btn'}
      aria-label={unread ? `Notifications, ${unread} non lue${unread > 1 ? 's' : ''}` : 'Notifications'}>
      <Icon name="bell" size={20} />
      {unread > 0 && <span className="tab-badge" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
    </Link>
  );
}
