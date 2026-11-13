'use client';
import { useRef } from 'react';
import { Icon } from './Icon';

/**
 * Bouton « Ajouter une photo » : ouvre l'appareil photo ou la galerie du téléphone. La photo choisie est transmise
 * telle quelle ; l'appelant la réduit (lib/photo.ts) et l'envoie.
 */
export function PhotoPicker({ label, onPick, disabled }: { label: string; onPick: (file: File) => void; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className="btn btn-quiet btn-small" disabled={disabled} onClick={() => input.current?.click()}>
        <Icon name="camera" size={18} />{label}
      </button>
      <input ref={input} type="file" accept="image/*" hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f); }} />
    </>
  );
}
