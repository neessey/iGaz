'use client';
import Link from 'next/link';
import { ReactNode } from 'react';
import { STATUS_LABEL, STATUS_TONE } from '@/lib/format';
import { OrderStatus } from '@/lib/types';
import { Icon } from './Icon';

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`badge badge-${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'error' | 'ok'; children: ReactNode }) {
  const cls = kind === 'error' ? 'notice notice-error' : kind === 'ok' ? 'notice notice-ok' : 'notice';
  return <div className={cls} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function Loading({ children = 'Chargement…' }: { children?: ReactNode }) {
  return <p className="muted" role="status">{children}</p>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card stack-sm">
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
    </div>
  );
}

/** Titre de page avec bouton retour rond, comme sur l'application mobile. */
export function PageHead({ title, back, action }: { title: string; back?: string; action?: ReactNode }) {
  return (
    <div className="page-head">
      {back && <Link href={back} className="back" aria-label="Retour"><Icon name="back" size={20} /></Link>}
      <h1 style={{ flex: 1 }}>{title}</h1>
      {action}
    </div>
  );
}

/** Titre de section avec lien « Voir tout ». */
export function SectionHead({ id, title, more }: { id?: string; title: string; more?: { href: string; label?: string } }) {
  return (
    <div className="section-head">
      <h2 id={id}>{title}</h2>
      {more && <Link className="link-more" href={more.href}>{more.label ?? 'Voir tout'} <Icon name="chevron" size={16} /></Link>}
    </div>
  );
}
