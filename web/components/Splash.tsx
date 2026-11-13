'use client';
import { useEffect, useState } from 'react';
import { LogoMark } from './Logo';

/** Hauteur du pictogramme, en px CSS. Les images de lancement iPhone (npm run icons) utilisent la même taille et le
 * même centrage, pour que l'écran de l'iPhone et celui de l'application se succèdent sans saut. */
export const SPLASH_MARK = 120;

/**
 * Écran de lancement : violet nuit, logo au centre. Affiché à l'ouverture de l'application, le temps de vérifier
 * la session (rendu aussi côté serveur : aucun contenu ne s'affiche avant). Pas d'animation.
 */
export function Splash() {
  return (
    <div className="splash night" role="status" aria-label="Ouverture d’iGaz CI">
      <LogoMark size={SPLASH_MARK} large />
      <p className="splash-brand" aria-hidden="true">
        <span className="logo-word">iGaz <span>CI</span></span>
        <span className="splash-tagline">Le gaz, simplement.</span>
      </p>
    </div>
  );
}

// Une « ouverture » = un chargement complet de la page ; la navigation dans l'application ne relance pas l'écran.
let launched = false;

/** Vrai pendant le premier instant de l'ouverture : l'écran de lancement reste visible au moins `ms` millisecondes. */
export function useLaunching(ms = 800) {
  const [waiting, setWaiting] = useState(!launched);
  useEffect(() => {
    if (launched) { setWaiting(false); return; }
    const t = setTimeout(() => { launched = true; setWaiting(false); }, ms);
    return () => clearTimeout(t);
  }, [ms]);
  return waiting;
}
