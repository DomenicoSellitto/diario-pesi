// Sessione di allenamento: serie, RIR, note, valori della volta precedente,
// timer di recupero e record personali.
import { route, go } from '../router.js';
import { h, toast, parseNum, fmtNum, fmtDate, fmtRest, setLabel, epley } from '../ui.js';
import { get, put, del, all, uid } from '../db.js';
import { exercisesMap, setsOfSession, historyOf, bestOf, sessionVolume, openSession } from '../data.js';
import { startTimer, stopTimer, timerState, restoreTimer, setNext, startWork } from '../timer.js';
import { GROUPS } from '../seed.js';

// Valori scritti ma non ancora confermati, per non perderli quando la scheda si ridisegna.
const drafts = new Map(); // chiave `${sessionId}|${exerciseId}|${setNumber}`
const extraRows = new Map(); // serie aggiunte a mano: `${sessionId}|${exerciseId}` -> numero

function draftOf(sessionId, exId, n) {
  const k = `${sessionId}|${exId}|${n}`;
  if (!drafts.has(k)) drafts.set(k, {});
  return drafts.get(k);
}

// Durata in formato 1:02:03 oppure 12:34
export function fmtDuration(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(t / 3600), mm = Math.floor((t % 3600) / 60), ss = t % 60;
  const p = (n) => String(n).padStart(2, '0');
  return hh ? `${hh}:${p(mm)}:${p(ss)}` : `${mm}:${p(ss)}`;
}

// Schermo sempre acceso mentre c'è un allenamento aperto (dove iOS lo permette).
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on) {
      if (!wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } else if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { wakeLock = null; }
}
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && await openSession()) keepAwake(true);
});

let clockTick = null;
let onWorkDone = null;
let onRestRecorded = null;

function targetSeconds(item) {
  const m = String(item.reps || '').match(/(\d+)\s*"/);
  return m ? Number(m[1]) : null;
}

route('/sessione/:id', async ({ id }) => {
  const session = await get('sessions', id);
  if (!session) return { title: 'Allenamento', back: '#/', node: h('p.empty', 'Allenamento non trovato.') };
  const template = await get('templates', session.templateId);
  const exMap = await exercisesMap();
  const isOpen = !session.end;

  let sets = await setsOfSession(id);
  // Se la scheda è stata eliminata, ricostruisco l'elenco dagli esercizi registrati
  const items = template ? [...template.items] : [...new Set(sets.map(s => s.exerciseId))].map(exId => ({
    exerciseId: exId, sets: sets.filter(s => s.exerciseId === exId).length, reps: '', restSec: 0, optional: false, note: '',
  }));
  for (const exId of session.extraExercises || []) {
    if (!items.some(i => i.exerciseId === exId)) items.push({ exerciseId: exId, sets: 1, reps: '', restSec: 60, optional: true, note: '', extra: true });
  }

  const histories = new Map();
  await Promise.all(items.map(async it => histories.set(it.exerciseId, await historyOf(it.exerciseId))));

  const node = h('div');

  // Intestazione: data e peso corporeo
  const bw = h('input', {
    type: 'text', inputmode: 'decimal', placeholder: 'facoltativo', value: session.bodyweight ?? '',
    onchange: async (e) => { session.bodyweight = parseNum(e.target.value); await put('sessions', session); },
  });
  const progress = h('div.progress', h('div.track', h('i')), h('div.txt', h('span'), h('span')));
  node.append(h('div.card',
    h('div.session-head',
      h('div.field', h('label', 'Peso corporeo (kg)'), bw),
      h('div.muted.small', { style: 'padding-bottom:12px;text-align:right' },
        fmtDate(session.start, true), h('br'),
        isOpen ? 'in corso' : `finito alle ${new Date(session.end).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`)),
    progress));

  // Cronometro dell'allenamento: parte da solo alla prima serie confermata
  // (così il riscaldamento non conta) oppure a mano toccandolo.
  const clock = h('button.clock-btn', {
    onclick: async () => {
      if (!isOpen) return;
      if (!session.workoutStart) {
        session.workoutStart = new Date().toISOString();
        await put('sessions', session);
        drawClock();
        toast('Cronometro avviato');
      } else {
        toast(`Cronometro partito alle ${new Date(session.workoutStart).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`);
      }
    },
  });
  function drawClock() {
    if (session.workoutStart) {
      const endMs = session.end ? new Date(session.end).getTime() : Date.now();
      clock.textContent = '⏱ ' + fmtDuration(endMs - new Date(session.workoutStart).getTime());
      clock.className = 'clock-btn running';
    } else {
      clock.textContent = isOpen ? '▶ Cronometro' : '';
      clock.className = 'clock-btn idle';
      clock.hidden = !isOpen;
    }
  }
  drawClock();
  clearInterval(clockTick);
  if (isOpen) {
    let seen = false;
    clockTick = setInterval(() => {
      if (clock.isConnected) { seen = true; drawClock(); }
      else if (seen) clearInterval(clockTick);
    }, 1000);
  }

  // Dati della serie a tempo di una riga (per far partire il lavoro in automatico)
  function workFromRow(row) {
    if (!row || row.dataset.mode !== 'time' || row.classList.contains('saved')) return null;
    const [wIn, secIn] = row.querySelectorAll('.set-inputs input');
    const seconds = Math.round(parseNum(secIn?.value) || 0);
    if (!seconds) return null;
    return {
      sessionId: id, exerciseId: row.dataset.ex, setNumber: Number(row.dataset.n), seconds,
      weight: parseNum(wIn?.value) ?? 0, restSec: Number(row.dataset.rest) || 0,
      label: row.dataset.title, exerciseName: exMap.get(row.dataset.ex)?.name || '',
    };
  }

  // Fine del lavoro a tempo: confermo la serie come se avessi toccato ✓
  document.removeEventListener('work-done', onWorkDone);
  onWorkDone = (e) => {
    const w = e.detail;
    if (!node.isConnected || w.sessionId !== id) return;
    const row = node.querySelector(`.set[data-ex="${CSS.escape(w.exerciseId)}"][data-n="${w.setNumber}"]`);
    if (!row || row.classList.contains('saved')) return;
    e.preventDefault();
    const secIn = row.querySelectorAll('.set-inputs input')[1];
    if (secIn) { secIn.value = String(w.seconds); secIn.dispatchEvent(new Event('input')); }
    row.querySelector('.check').click();
  };
  document.addEventListener('work-done', onWorkDone);
  document.removeEventListener('rest-recorded', onRestRecorded);
  onRestRecorded = (e) => {
    const s = sets.find(x => x.id === e.detail.setId);
    if (s) s.restSec = e.detail.elapsed;
  };
  document.addEventListener('rest-recorded', onRestRecorded);

  function updateProgress() {
    const main = items.filter(i => !i.optional);
    let doneEx = 0, doneSets = 0, totalSets = 0;
    for (const it of main) {
      const n = sets.filter(s => s.exerciseId === it.exerciseId).length;
      totalSets += it.sets || 1;
      doneSets += Math.min(n, it.sets || 1);
      if (n >= (it.sets || 1)) doneEx++;
    }
    progress.querySelector('.track i').style.width = (totalSets ? (doneSets / totalSets) * 100 : 0) + '%';
    const [a, b] = progress.querySelectorAll('.txt span');
    a.textContent = `Esercizi ${doneEx} / ${main.length}`;
    b.textContent = `Serie ${doneSets} / ${totalSets}`;
  }

  // Evidenzia la serie da fare adesso: la prossima non confermata dopo l'ultima fatta.
  function markCurrent(scroll) {
    node.querySelectorAll('.set.current').forEach(r => { r.classList.remove('current'); r.querySelector('.now-tag')?.remove(); });
    node.querySelectorAll('.ex.current-ex').forEach(c => c.classList.remove('current-ex'));
    if (!isOpen) return null;
    const rows = [...node.querySelectorAll('.set')].filter(r => !r.closest('details:not([open])'));
    const last = [...sets].sort((a, b) => (a.ts || '').localeCompare(b.ts || '')).pop();
    let start = 0;
    if (last) {
      const i = rows.findIndex(r => r.dataset.ex === last.exerciseId && Number(r.dataset.n) === last.setNumber);
      if (i >= 0) start = i;
    }
    const pending = (r) => !r.classList.contains('saved');
    const cur = rows.slice(start).find(pending) || rows.find(pending);
    if (!cur) { setNext(''); return null; }
    cur.classList.add('current');
    cur.prepend(h('div.now-tag', 'SERIE IN CORSO'));
    const card = cur.closest('.ex');
    card.classList.add('current-ex');
    setNext(cur.dataset.label, workFromRow(cur));
    if (scroll && (!last || last.exerciseId !== cur.dataset.ex)) {
      setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    }
    return cur;
  }

  const cards = new Map();

  function renderCard(item) {
    const ex = exMap.get(item.exerciseId) || { id: item.exerciseId, name: '(esercizio eliminato)', mode: 'reps' };
    const mode = ex.mode || 'reps';
    const mine = sets.filter(s => s.exerciseId === ex.id).sort((a, b) => a.setNumber - b.setNumber);
    const hist = histories.get(ex.id) || [];
    const prevEntry = hist.find(e => e.session.id !== id && e.session.start < session.start) || hist.find(e => e.session.id !== id);
    const prev = prevEntry ? prevEntry.sets : [];
    const extraKey = `${id}|${ex.id}`;
    const maxSaved = mine.reduce((m, s) => Math.max(m, s.setNumber), 0);
    const rowsCount = Math.max(item.sets || 1, maxSaved) + (extraRows.get(extraKey) || 0);

    const card = h('div.card.ex');
    const target = [
      item.sets ? `${item.sets} × ${item.reps || '–'}` : '',
      item.restSec ? `rec. ${fmtRest(item.restSec)}` : '',
    ].filter(Boolean).join(' · ');
    card.append(h('div.ex-head',
      h('div', { style: 'flex:1' },
        h('h3', h('a', { href: '#/esercizio/' + ex.id, style: 'color:inherit;text-decoration:none' }, ex.name)),
        target ? h('div.ex-target', target) : null,
        prevEntry ? h('div.ex-target', `Ultima volta: ${fmtDate(prevEntry.session.start)}`) : null),
      mine.length >= (item.sets || 1) ? h('span', { style: 'color:var(--ok);font-weight:700' }, '✓') : null));
    if (item.note) card.append(h('div.ex-note-tpl', item.note));
    if (mine.length >= (item.sets || 1)) card.classList.add('done-all');

    for (let n = 1; n <= rowsCount; n++) {
      card.append(renderRow(item, ex, mode, n, mine.find(s => s.setNumber === n), prev, mine));
    }

    // Azioni dell'esercizio
    const exNote = (session.exerciseNotes || {})[ex.id] || '';
    const noteBox = h('textarea', {
      placeholder: 'Nota sull\'esercizio (macchina, regolazioni, sensazioni…)', hidden: !exNote,
      onchange: async (e) => {
        session.exerciseNotes = session.exerciseNotes || {};
        session.exerciseNotes[ex.id] = e.target.value.trim();
        await put('sessions', session);
      },
    });
    noteBox.value = exNote;
    const prevNote = prevEntry?.session.exerciseNotes?.[ex.id];
    card.append(h('div.row.wrap', { style: 'margin-top:8px' },
      h('button.linkbtn', { onclick: () => { extraRows.set(extraKey, (extraRows.get(extraKey) || 0) + 1); refresh(item); } }, '+ serie'),
      h('span.spacer'),
      h('button.linkbtn', { onclick: () => { noteBox.hidden = !noteBox.hidden; if (!noteBox.hidden) noteBox.focus(); } }, exNote ? 'Nota ✎' : '+ nota')),
      noteBox);
    if (prevNote) card.append(h('div.small.muted', { style: 'margin-top:4px' }, `Nota della volta scorsa: ${prevNote}`));
    return card;
  }

  function renderRow(item, ex, mode, n, saved, prev, mine) {
    const d = draftOf(id, ex.id, n);
    const p = prev.find(s => s.setNumber === n) || null;
    const lastPrev = prev[prev.length - 1];
    const prevRowMine = mine.filter(s => s.setNumber < n).pop();
    const row = h('div.set', { class: saved ? 'saved' : '' });
    row.dataset.ex = ex.id;
    row.dataset.n = String(n);
    row.dataset.label = `${ex.name} · serie ${n}` + (p ? ` · ultima ${setLabel(p, mode)}` : '');
    row.dataset.title = `${ex.name} · serie ${n}`;
    row.dataset.mode = mode;
    row.dataset.rest = String(item.restSec || 0);

    if (mode === 'check') {
      row.append(h('div.set-top',
        h('span.set-n', n),
        h('span', { style: 'flex:1' }, saved ? 'Fatto' : 'Da fare'),
        h('button.check', {
          'aria-label': saved ? 'Annulla' : 'Fatto',
          onclick: async () => {
            if (saved) { await del('sets', saved.id); sets = sets.filter(s => s.id !== saved.id); }
            else {
              const s = { id: uid(), sessionId: id, exerciseId: ex.id, setNumber: n, weight: null, reps: null, durationSec: null, rir: null, restSec: null, note: '', ts: new Date().toISOString() };
              await put('sets', s); sets.push(s);
            }
            refresh(item, !saved);
          },
        }, '✓')));
      return row;
    }

    const defWeight = saved?.weight ?? d.weight ?? (p?.weight ?? prevRowMine?.weight ?? lastPrev?.weight ?? '');
    const wIn = h('input', {
      type: 'text', inputmode: 'decimal', 'aria-label': 'Peso in kg',
      value: defWeight === null ? '' : String(defWeight).replace('.', ','),
      oninput: (e) => { d.weight = e.target.value; },
      onchange: () => saved && saveEdits(),
      onfocus: (e) => e.target.select(),
    });
    let amountIn;
    if (mode === 'time') {
      const defSec = saved?.durationSec ?? d.sec ?? p?.durationSec ?? targetSeconds(item) ?? '';
      amountIn = h('input', {
        type: 'text', inputmode: 'numeric', pattern: '[0-9]*', 'aria-label': 'Secondi', value: defSec,
        oninput: (e) => { d.sec = e.target.value; }, onchange: () => saved && saveEdits(), onfocus: (e) => e.target.select(),
      });
    } else {
      amountIn = h('input', {
        type: 'text', inputmode: 'numeric', pattern: '[0-9]*', 'aria-label': 'Ripetizioni',
        placeholder: p?.reps != null ? String(p.reps) : 'rip', value: saved?.reps ?? d.reps ?? '',
        oninput: (e) => { d.reps = e.target.value; }, onchange: () => saved && saveEdits(),
      });
    }

    let rir = saved ? saved.rir : (d.rir ?? null);

    async function saveEdits() {
      const weight = parseNum(wIn.value) ?? 0;
      const amount = parseNum(amountIn.value);
      if (amount == null || amount <= 0) {
        amountIn.focus();
        toast(mode === 'time' ? 'Scrivi i secondi' : 'Scrivi le ripetizioni');
        return null;
      }
      const s = saved || { id: uid(), sessionId: id, exerciseId: ex.id, setNumber: n, restSec: null, note: d.note || '', pr: false };
      s.weight = weight;
      if (mode === 'time') { s.durationSec = Math.round(amount); s.reps = null; }
      else { s.reps = Math.round(amount); s.durationSec = null; }
      s.rir = rir;
      s.ts = s.ts || new Date().toISOString();
      if (!saved) s.pr = checkRecord(ex, mode, s);
      await put('sets', s);
      if (!saved) sets.push(s);
      return s;
    }

    const checkBtn = h('button.check', {
      'aria-label': saved ? 'Serie salvata' : 'Completa serie',
      onclick: async () => {
        if (saved) { await saveEdits(); toast('Serie aggiornata'); refresh(item); return; }
        // Chiudo il recupero precedente (viene salvato nella serie che l'aveva avviato)
        const prevTimer = timerState();
        if (prevTimer) {
          const rest = await stopTimer();
          const ps = sets.find(x => x.id === prevTimer.setId);
          if (ps && rest != null) ps.restSec = rest;
        }
        const s = await saveEdits();
        if (!s) return;
        drafts.delete(`${id}|${ex.id}|${n}`);
        if (isOpen && !session.workoutStart) {
          session.workoutStart = new Date().toISOString();
          await put('sessions', session);
          drawClock();
        }
        if (isOpen && item.restSec) startTimer({ setId: s.id, duration: item.restSec, label: ex.name });
        refresh(item, true);
      },
    }, '✓');

    row.append(h('div.set-top',
      h('span.set-n', n),
      h('div.set-inputs', wIn, h('span.unit', 'kg'), h('span.x', '×'), amountIn, h('span.unit', mode === 'time' ? 'sec' : 'rip')),
      checkBtn));

    // Valori della volta precedente
    row.append(h('div.prev', p ? ['ultima: ', h('b', setLabel(p, mode))] : (lastPrev ? ['ultima: —'] : 'prima volta'),
      saved?.pr ? h('span.pr-badge', '  🏆 record') : null));

    if (mode === 'reps') {
      const rirBox = h('div.rir', h('span', 'RIR'));
      [[0, '0'], [1, '1'], [2, '2'], [3, '3+']].forEach(([v, label]) => {
        rirBox.append(h('button', {
          class: rir === v ? 'on' : '',
          'aria-label': v === 0 ? 'RIR 0, cedimento' : `RIR ${label}`,
          onclick: async (e) => {
            rir = rir === v ? null : v;
            d.rir = rir;
            rirBox.querySelectorAll('button').forEach(b => b.classList.remove('on'));
            if (rir !== null) e.currentTarget.classList.add('on');
            if (saved) { saved.rir = rir; await put('sets', saved); }
          },
        }, label));
      });
      row.append(rirBox);
    }

    // Nota della serie, recupero ed eliminazione
    const noteIn = h('input', {
      type: 'text', placeholder: 'Nota sulla serie', value: saved?.note ?? d.note ?? '',
      hidden: !(saved?.note || d.note),
      oninput: (e) => { d.note = e.target.value; },
      onchange: async (e) => { if (saved) { saved.note = e.target.value.trim(); await put('sets', saved); } },
    });
    const prevLine = row.querySelector('.prev');
    prevLine.classList.add('set-extra');
    prevLine.append(...[
      h('span.spacer'),
      mode === 'time' && !saved && isOpen ? h('button.work-btn', {
        onclick: () => { const w = workFromRow(row); if (w) startWork(w); },
      }, `▶ Avvia ${parseNum(amountIn.value) || ''}"`) : null,
      saved?.restSec ? h('span.set-meta', `rec. ${fmtRest(saved.restSec)}`) : null,
      h('button.linkbtn', { onclick: () => { noteIn.hidden = !noteIn.hidden; if (!noteIn.hidden) noteIn.focus(); } }, (saved?.note || d.note) ? 'nota ✎' : '+ nota'),
      saved ? h('button.linkbtn.danger', {
        onclick: async () => {
          if (!confirm(`Eliminare la serie ${n}?`)) return;
          await del('sets', saved.id);
          sets = sets.filter(s => s.id !== saved.id);
          const st = timerState();
          if (st?.setId === saved.id) await stopTimer();
          refresh(item);
        },
      }, 'elimina') : null].filter(Boolean));
    row.append(h('div.set-note', noteIn));
    return row;
  }

  // Record personali: confronto con tutte le serie precedenti dell'esercizio.
  function checkRecord(ex, mode, s) {
    if (mode !== 'reps') return false;
    const hist = histories.get(ex.id) || [];
    const others = [
      ...hist.filter(e => e.session.id !== id).flatMap(e => e.sets),
      ...sets.filter(x => x.exerciseId === ex.id && x.id !== s.id),
    ];
    if (!hist.some(e => e.session.id !== id)) return false; // prima volta: niente record
    const best = bestOf(others);
    const e1 = epley(s.weight, s.reps);
    if (s.weight > 0 && e1 && e1 > best.e1rm + 0.05) {
      toast(`🏆 Record! 1RM stimato ${fmtNum(e1)} kg (prima ${fmtNum(best.e1rm)})`, { type: 'pr', ms: 5000 });
      return true;
    }
    if (s.weight > 0 && s.weight > best.weight) {
      toast(`🏆 Record di carico: ${fmtNum(s.weight, 2)} kg`, { type: 'pr', ms: 5000 });
      return true;
    }
    if (!s.weight && !best.weight && s.reps > best.reps) {
      toast(`🏆 Record di ripetute: ${s.reps}`, { type: 'pr', ms: 5000 });
      return true;
    }
    return false;
  }

  function refresh(item, advance = false) {
    const old = cards.get(item.exerciseId);
    const fresh = renderCard(item);
    cards.set(item.exerciseId, fresh);
    old.replaceWith(fresh);
    updateProgress();
    markCurrent(advance);
  }

  // Esercizi principali
  const main = items.filter(i => !i.optional);
  const optional = items.filter(i => i.optional);
  for (const it of main) { const c = renderCard(it); cards.set(it.exerciseId, c); node.append(c); }

  // Opzionali: core e stretching ("se c'è tempo")
  const anyOptDone = optional.some(it => sets.some(s => s.exerciseId === it.exerciseId));
  const det = h('details.optional', { open: anyOptDone || undefined },
    h('summary', h('h2', 'Se c\'è tempo: core e stretching')));
  for (const it of optional) { const c = renderCard(it); cards.set(it.exerciseId, c); det.append(c); }
  det.append(addExercisePanel(session, exMap, items));
  det.addEventListener('toggle', () => markCurrent(false));
  node.append(det);

  // Note e chiusura
  const note = h('textarea', {
    placeholder: 'Note sull\'allenamento (facoltative)',
    onchange: async (e) => { session.note = e.target.value.trim(); await put('sessions', session); },
  });
  note.value = session.note || '';
  node.append(h('h2', 'Note'), note);

  const actions = h('div', { style: 'margin-top:16px;display:flex;flex-direction:column;gap:10px' });
  if (isOpen) {
    actions.append(h('button.btn.primary.block', {
      onclick: async () => {
        if (timerState()) await stopTimer();
        const all = await setsOfSession(id);
        if (!all.length && !confirm('Non hai registrato nessuna serie. Terminare comunque?')) return;
        session.end = new Date().toISOString();
        await put('sessions', session);
        keepAwake(false);
        const dur = session.workoutStart ? `, durata ${fmtDuration(new Date(session.end) - new Date(session.workoutStart))}` : '';
        toast(`Allenamento salvato: ${all.length} serie, volume ${fmtNum(sessionVolume(all), 0)} kg${dur}`, { ms: 6000 });
        go('#/');
      },
    }, 'Termina allenamento'));
  } else {
    actions.append(h('button.btn.block', {
      onclick: async () => { session.end = null; await put('sessions', session); go('#/sessione/' + id); },
    }, 'Riapri allenamento'));
  }
  actions.append(h('button.btn.danger.block', {
    onclick: async () => {
      if (!confirm('Eliminare questo allenamento e tutte le sue serie? Non si può annullare.')) return;
      if (timerState()) await stopTimer();
      for (const s of await setsOfSession(id)) await del('sets', s.id);
      await del('sessions', id);
      keepAwake(false);
      go('#/');
    },
  }, 'Elimina allenamento'));
  node.append(actions);

  updateProgress();
  const cur = markCurrent(false);
  if (isOpen) {
    restoreTimer();
    keepAwake(true);
    // Riaprendo un allenamento già iniziato, vado direttamente alla serie in corso
    if (cur && sets.length) setTimeout(() => cur.closest('.ex').scrollIntoView({ block: 'start' }), 60);
  }

  return { title: `Scheda ${session.templateName}`, back: '#/', node, tab: 'home', right: clock };
});

// Aggiunge un esercizio solo a questa sessione (utile per il core, che cambia spesso).
function addExercisePanel(session, exMap, items) {
  const wrap = h('div.card');
  const present = new Set(items.map(i => i.exerciseId));
  const options = [...exMap.values()].filter(e => !present.has(e.id)).sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  const sel = h('select', h('option', { value: '' }, 'Scegli un esercizio…'),
    ...GROUPS.map(g => {
      const list = options.filter(o => o.group === g);
      return list.length ? h('optgroup', { label: g }, ...list.map(o => h('option', { value: o.id }, o.name))) : null;
    }),
    h('option', { value: '__new' }, '+ Nuovo esercizio…'));
  const newBox = h('div', { hidden: true },
    h('div.field', h('label', 'Nome'), h('input', { type: 'text', name: 'name', placeholder: 'es. Russian twist' })),
    h('div.field', h('label', 'Gruppo muscolare'), h('select', { name: 'group' }, ...GROUPS.map(g => h('option', { selected: g === 'Core' || undefined }, g)))),
    h('div.field', h('label', 'Si registra con'), h('select', { name: 'mode' },
      h('option', { value: 'reps' }, 'peso × ripetizioni'), h('option', { value: 'time' }, 'peso × secondi'), h('option', { value: 'check' }, 'solo "fatto"'))));
  sel.addEventListener('change', () => { newBox.hidden = sel.value !== '__new'; });
  wrap.append(h('div.field', h('label', 'Aggiungi un esercizio a questo allenamento'), sel), newBox,
    h('button.btn.block', {
      onclick: async () => {
        let exId = sel.value;
        if (!exId) return toast('Scegli un esercizio');
        if (exId === '__new') {
          const name = newBox.querySelector('[name=name]').value.trim();
          if (!name) return toast('Scrivi il nome');
          exId = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid();
          if (exMap.has(exId)) exId += '-' + uid().slice(-4);
          await put('exercises', { id: exId, name, group: newBox.querySelector('[name=group]').value, type: 'altro', mode: newBox.querySelector('[name=mode]').value, note: '' });
        }
        session.extraExercises = [...(session.extraExercises || []), exId];
        await put('sessions', session);
        go('#/sessione/' + session.id);
      },
    }, 'Aggiungi'));
  return wrap;
}

// Al riavvio dell'app, se c'era un recupero in corso, il timer ricompare.
if (timerState()) all('sessions').then(list => { if (list.some(s => !s.end)) restoreTimer(); });
