// Punto di partenza dell'app.
import { openDB } from './db.js';
import { seedIfEmpty } from './seed.js';
import { render } from './router.js';
import { h } from './ui.js';

// Schermate (ognuna si registra nel router)
import './views/home.js';
import './views/session.js';
import './views/history.js';
import './views/summary.js';
import './views/more.js';
import './views/templates.js';

async function start() {
  await openDB();
  await seedIfEmpty();
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  await render();
}

// Service worker: offline e aggiornamenti
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
      const showUpdate = (worker) => {
        if (document.querySelector('.update-banner')) return;
        const banner = h('div.toast.update-banner',
          h('span', { style: 'flex:1' }, 'È disponibile una nuova versione.'),
          h('button', { onclick: () => worker.postMessage('SKIP_WAITING') }, 'Aggiorna'));
        document.body.append(banner);
      };
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(w);
        });
      });
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        location.reload();
      });
      // Controlla aggiornamenti quando l'app torna in primo piano
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    } catch (e) { console.warn('Service worker non registrato', e); }
  });
}

start();
