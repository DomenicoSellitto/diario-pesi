// Backup: esportazione JSON (completa, reimportabile) e CSV (per analisi), importazione JSON.
import { dumpAll, replaceAll, setMeta, DB_VERSION, STORES } from './db.js';
import { todayKey } from './ui.js';

export async function buildJSON() {
  const data = await dumpAll();
  const payload = { app: 'diario-pesi', schemaVersion: DB_VERSION, exportedAt: new Date().toISOString(), data };
  const blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' });
  return new File([blob], `forge-backup-${todayKey()}.json`, { type: 'application/json' });
}

const csvCell = (v) => {
  if (v == null) return '';
  const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function buildCSV() {
  const { sessions, sets, exercises, boxing } = await dumpAll();
  const sMap = new Map(sessions.map(s => [s.id, s]));
  const eMap = new Map(exercises.map(e => [e.id, e]));
  const rows = [['data', 'tipo', 'scheda', 'esercizio', 'gruppo', 'serie', 'peso_kg', 'ripetizioni', 'secondi', 'rir', 'recupero_sec', 'record', 'nota', 'peso_corporeo']];
  const ordered = [...sets].sort((a, b) => (sMap.get(a.sessionId)?.start || '').localeCompare(sMap.get(b.sessionId)?.start || '') || (a.ts || '').localeCompare(b.ts || ''));
  for (const s of ordered) {
    const ses = sMap.get(s.sessionId); const ex = eMap.get(s.exerciseId);
    if (!ses) continue;
    rows.push([todayKey(new Date(ses.start)), 'pesi', ses.templateName, ex?.name || s.exerciseId, ex?.group || '', s.setNumber,
      s.weight, s.reps, s.durationSec, s.rir === 3 ? '3+' : s.rir, s.restSec, s.pr ? 'sì' : '', s.note || '', ses.bodyweight]);
  }
  for (const b of [...boxing].sort((a, b) => a.date.localeCompare(b.date))) {
    rows.push([b.date, 'pugilato', '', b.type, '', '', '', '', '', '', '', '', '', '']);
  }
  const text = '﻿' + rows.map(r => r.map(csvCell).join(';')).join('\n');
  return new File([text], `forge-${todayKey()}.csv`, { type: 'text/csv' });
}

// Su iPhone apre il foglio di condivisione (Salva in File, AirDrop, Mail...).
// Altrove scarica il file.
export async function shareOrDownload(file) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'aborted';
      if (e.name !== 'NotAllowedError') throw e;
      return 'needs-tap';
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}

export async function markBackupDone() { await setMeta('lastBackup', new Date().toISOString()); }

// Per le versioni future del formato dati: trasforma un backup vecchio nel formato attuale.
function migrateBackup(payload) {
  // if (payload.schemaVersion < 2) { ... }
  return payload;
}

export async function importJSON(file) {
  const text = await file.text();
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error('Il file non è un JSON valido.'); }
  if (payload?.app !== 'diario-pesi' || !payload.data) throw new Error('Questo file non è un backup di Forge.');
  if (payload.schemaVersion > DB_VERSION) throw new Error('Il backup viene da una versione più nuova dell\'app: aggiorna prima l\'app.');
  payload = migrateBackup(payload);
  const data = {};
  for (const name of STORES) data[name] = Array.isArray(payload.data[name]) ? payload.data[name] : [];
  await replaceAll(data);
  return { sessions: data.sessions.length, sets: data.sets.length, boxing: data.boxing.length };
}
