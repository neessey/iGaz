'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { choseWeb, useInstall } from '@/lib/install';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

/**
 * Boutons de la page de présentation : « Installer l'application » (invite de Chrome si elle est disponible, sinon
 * la marche à suivre selon le téléphone) et « Utiliser dans le navigateur ».
 */
export function InstallApp({ light = false, web = true }: { light?: boolean; web?: boolean }) {
  const { canPrompt, justInstalled, platform, install } = useInstall();
  const [help, setHelp] = useState(false);
  const router = useRouter();

  async function onInstall() {
    if (!(await install())) setHelp(true);
  }

  return (
    <div className="install-actions">
      {justInstalled ? (
        <p className={`install-done${light ? ' on-night' : ''}`} role="status">
          <Icon name="check" size={20} />Application installée : ouvrez « iGaz CI » depuis votre écran d’accueil.
        </p>
      ) : (
        <button className="btn" onClick={onInstall}>
          <Icon name="download" size={20} />Installer l’application
        </button>
      )}
      {web && (
        <button className={`btn ${light ? 'btn-ghost-light' : 'btn-quiet'}`} onClick={() => { choseWeb(); router.push('/'); }}>
          Utiliser dans le navigateur
        </button>
      )}
      {help && (
        <Sheet title="Installer iGaz CI" onClose={() => setHelp(false)}>
          {platform === 'ios' ? (
            <ol className="install-steps">
              <li>Dans Safari, touchez <strong>Partager</strong> <Icon name="share" size={18} /> en bas de l’écran.</li>
              <li>Choisissez <strong>« Sur l’écran d’accueil »</strong> (faites défiler la liste si besoin).</li>
              <li>Touchez <strong>Ajouter</strong> : l’icône iGaz CI apparaît sur votre écran d’accueil.</li>
            </ol>
          ) : platform === 'android' ? (
            <ol className="install-steps">
              <li>Dans Chrome, touchez le menu <strong>⋮</strong> en haut à droite.</li>
              <li>Choisissez <strong>« Installer l’application »</strong> ou <strong>« Ajouter à l’écran d’accueil »</strong>.</li>
              <li>Confirmez : l’icône iGaz CI apparaît avec vos autres applications.</li>
            </ol>
          ) : (
            <ol className="install-steps">
              <li>Dans Chrome ou Edge, cliquez sur l’icône d’installation <Icon name="download" size={18} /> à droite de la barre d’adresse.</li>
              <li>Ou ouvrez le menu du navigateur et choisissez <strong>« Installer iGaz CI »</strong>.</li>
              <li>Sur ordinateur, vous pouvez aussi simplement utiliser la version navigateur.</li>
            </ol>
          )}
          <p className="small muted">Si l’application est déjà installée, ouvrez-la depuis votre écran d’accueil.</p>
          <button className="btn btn-block" onClick={() => setHelp(false)}>J’ai compris</button>
        </Sheet>
      )}
    </div>
  );
}
