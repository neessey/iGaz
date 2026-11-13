'use client';
import { ReactNode, useEffect, useRef } from 'react';

/**
 * Volet qui s'ouvre en bas de l'écran (comme dans les applis de livraison). Se ferme par Échap, par le fond
 * ou par le bouton « Fermer » ; le focus revient ensuite sur l'élément qui l'a ouvert.
 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      opener?.focus();
    };
  }, []);

  return (
    <div className="sheet-backdrop" onClick={() => close.current()}>
      <div className="sheet stack" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" aria-hidden="true" />
        {children}
        <button type="button" className="btn btn-quiet btn-block" onClick={() => close.current()}>Fermer</button>
      </div>
    </div>
  );
}
