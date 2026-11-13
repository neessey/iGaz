'use client';
import { ReactNode } from 'react';
import { STATUS_LABEL, STATUS_TONE } from '@/lib/format';
import { OrderStatus } from '@/lib/types';

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
    <div className="panel stack-sm">
      <h3>{title}</h3>
      {children && <p className="muted">{children}</p>}
    </div>
  );
}
