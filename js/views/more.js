// Schermata "Altro": schede, backup, informazioni.
import { route, go } from '../router.js';
import { h, toast, fmtDate } from '../ui.js';
import { getMeta } from '../db.js';
import { buildJSON, buildCSV, shareOrDownload, importJSON, markBackupDone } from '../backup.js';

async function exportFile(build, isFull, btn) {
  btn.disabled = true;
  try {
    const file = await build();
    let res = await shareOrDownload(file);
    if (res === 'needs-tap') {
      // Safari a volte vuole un secondo tocco per aprire la condivisione
      const again = h('button.btn.primary.block', {
        onclick: async () => {
          const r = await shareOrDownload(file);
          again.remove();
          if (r !== 'aborted' && isFull) { await markBackupDone(); go('#/altro'); }
        },
      }, `Condividi ${file.name}`);
      btn.after(again);
      return;
    }
    if (res !== 'aborted' && isFull) { await markBackupDone(); go('#/altro'); }
  } catch (e) {
    toast('Esportazione non riuscita: ' + e.message);
  } finally { btn.disabled = false; }
}

route('/altro', async () => {
  const last = await getMeta('lastBackup');
  const node = h('div');

  node.append(h('h2', 'Schede'),
    h('ul.list.card', { style: 'padding:0 12px' },
      h('li', h('a.item', { href: '#/schede' }, h('span', { style: 'flex:1' }, 'Gestisci schede e cambio scheda'), h('span.chev', '›')))));

  const days = last ? Math.floor((Date.now() - new Date(last)) / 86400000) : null;
  const jsonBtn = h('button.btn.primary.block', { onclick: () => exportFile(buildJSON, true, jsonBtn) }, 'Esporta backup completo (JSON)');
  const csvBtn = h('button.btn.block', { onclick: () => exportFile(buildCSV, false, csvBtn) }, 'Esporta per analisi (CSV)');
  const fileIn = h('input', { type: 'file', accept: '.json,application/json', hidden: true,
    onchange: async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      if (!confirm('Importare questo backup? Tutti i dati attuali verranno SOSTITUITI con quelli del file.')) return;
      try {
        const r = await importJSON(f);
        toast(`Backup importato: ${r.sessions} allenamenti, ${r.sets} serie, ${r.boxing} sedute di pugilato`, { ms: 5000 });
        go('#/');
      } catch (err) { toast(err.message, { ms: 6000 }); }
    } });

  node.append(h('h2', 'Backup'),
    h('div.card',
      h('p.small', { style: 'margin-top:0' },
        'I dati sono salvati solo su questo telefono. Fai un backup ogni tanto e salvalo in File → iCloud Drive.'),
      h('p.small' + (days == null || days > 30 ? '' : '.muted'), { style: days == null || days > 30 ? 'color:var(--accent);font-weight:600' : '' },
        last ? `Ultimo backup: ${fmtDate(last, true)} (${days === 0 ? 'oggi' : days + ' giorni fa'})` : 'Non hai ancora fatto un backup.'),
      h('div', { style: 'display:flex;flex-direction:column;gap:8px' },
        jsonBtn, csvBtn,
        h('button.btn.ghost.block', { onclick: () => fileIn.click() }, 'Importa backup (JSON)'),
        fileIn)));

  node.append(h('h2', 'Informazioni'),
    h('div.card.small',
      h('p', { style: 'margin-top:0' }, 'Diario Pesi · funziona anche senza connessione.'),
      h('p', 'Il timer di recupero resta giusto anche se chiudi l\'app, ma con lo schermo bloccato il suono non è garantito.'),
      h('p.muted', { id: 'ver', style: 'margin-bottom:0' }, '')));

  if (navigator.serviceWorker?.controller) {
    caches.keys().then(k => { const v = k.find(x => x.startsWith('diario-pesi-')); const el = document.getElementById('ver'); if (el && v) el.textContent = 'Versione: ' + v.replace('diario-pesi-', ''); });
  }

  return { title: 'Altro', node, tab: 'altro' };
});
