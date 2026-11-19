// Timer di recupero (e di lavoro per gli esercizi a tempo).
// Una fascia in basso e, toccandola, una vista a schermo intero.
// Il tempo si calcola dai timestamp (Date.now()), non da un contatore:
// così resta giusto anche se iOS sospende l'app in background.
//
// Fasi:
//  - 'rest': recupero dopo una serie. Se la prossima serie è a tempo (st.work),
//    a fine recupero parte da sola la fase di lavoro.
//  - 'work': conto alla rovescia della serie a tempo. Alla fine la serie viene
//    confermata (dalla pagina della sessione, se aperta; altrimenti qui).
import { h, fmtSec } from './ui.js';
import { get, put, uid } from './db.js';

const KEY = 'diario-pesi-timer';
let tick = null;
let audio = null;
let beepedFor = null; // chiave della fase per cui ho già suonato
let full = null;      // vista a schermo intero, se aperta
let finishing = false;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}
function save(state) {
  try {
    if (state) localStorage.setItem(KEY, JSON.stringify(state));
    else localStorage.removeItem(KEY);
  } catch { /* memoria non disponibile */ }
}

export function timerState() { return load(); }

// Avvia il recupero dopo una serie.
// setId = la serie a cui verrà associato il recupero effettivo; next = testo della prossima serie;
// work = dati della prossima serie se è a tempo (per far partire il lavoro in automatico).
export function startTimer({ setId, duration, label, next, work }) {
  unlockAudio();
  save({ phase: 'rest', setId, duration, label, next: next || '', work: work || null, start: Date.now() });
  show();
}

// Fa partire subito la fase di lavoro di una serie a tempo.
export async function startWork(work) {
  unlockAudio();
  const st = load();
  if (st?.phase === 'rest') await recordRest(st, Date.now());
  save({ phase: 'work', setId: null, duration: work.seconds, label: work.label, next: '', work, start: Date.now() });
  show();
  openFull();
}

// Aggiorna la "prossima serie" senza toccare il tempo.
export function setNext(next, work) {
  const st = load();
  if (!st || st.phase !== 'rest') return;
  st.next = next || '';
  st.work = work || null;
  save(st);
  draw();
}

async function recordRest(st, endMs) {
  if (!st.setId) return null;
  const elapsed = Math.round((endMs - st.start) / 1000);
  const s = await get('sets', st.setId);
  if (s) { s.restSec = elapsed; await put('sets', s); }
  document.dispatchEvent(new CustomEvent('rest-recorded', { detail: { setId: st.setId, elapsed } }));
  return elapsed;
}

// Ferma il timer. Se era un recupero, salva il recupero effettivo nella serie che lo aveva avviato.
export async function stopTimer() {
  const st = load();
  if (!st) return null;
  save(null);
  hide();
  if (st.phase === 'work') return null;
  return recordRest(st, Date.now());
}

function adjust(delta) {
  const st = load();
  if (!st) return;
  st.duration = Math.max(0, st.duration + delta);
  save(st);
  draw();
}

// Il recupero è finito: parte il lavoro, con l'inizio esatto calcolato dai timestamp.
async function restToWork(st) {
  const restEnd = st.start + st.duration * 1000;
  await recordRest(st, restEnd);
  save({ phase: 'work', setId: null, duration: st.work.seconds, label: st.work.label, next: '', work: st.work, start: restEnd });
  if (document.visibilityState === 'visible') openFull();
}

// Il lavoro è finito: la serie viene confermata.
async function finishWork(st) {
  if (finishing) return;
  finishing = true;
  try {
    save(null);
    hide();
    const work = st.work;
    // Se la pagina della sessione è aperta, conferma lei la serie (con i valori scritti nella riga)
    const ev = new CustomEvent('work-done', { detail: work, cancelable: true });
    document.dispatchEvent(ev);
    if (ev.defaultPrevented) return;
    // Altrimenti salvo qui con i valori previsti e faccio partire il recupero
    const set = {
      id: uid(), sessionId: work.sessionId, exerciseId: work.exerciseId, setNumber: work.setNumber,
      weight: work.weight ?? 0, reps: null, durationSec: work.seconds, rir: null, restSec: null,
      note: '', pr: false, ts: new Date().toISOString(),
    };
    await put('sets', set);
    if (work.restSec) startTimer({ setId: set.id, duration: work.restSec, label: work.exerciseName || work.label });
  } finally { finishing = false; }
}

function unlockAudio() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch { audio = null; }
}

function beep(freq = 880, times = 3) {
  if (!audio) return;
  try {
    const t0 = audio.currentTime;
    for (let i = 0; i < times; i++) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0 + i * 0.25);
      g.gain.exponentialRampToValueAtTime(0.4, t0 + i * 0.25 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.25 + 0.18);
      o.connect(g).connect(audio.destination);
      o.start(t0 + i * 0.25); o.stop(t0 + i * 0.25 + 0.2);
    }
  } catch { /* niente suono */ }
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

function bar() { return document.getElementById('timer'); }

const RING = 2 * Math.PI * 120;

function draw() {
  const st = load();
  if (!st) { hide(); return; }
  const now = Date.now();
  const elapsed = (now - st.start) / 1000;
  const left = st.duration - elapsed;
  const phaseKey = `${st.phase}|${st.start}`;
  // Dimenticato acceso da più di 10 minuti oltre il previsto: lo chiudo senza salvare.
  if (elapsed > st.duration + 600) { save(null); hide(); return; }

  if (st.phase === 'rest' && left <= 0 && st.work) {
    if (left > -5) beep(1175, 2); // segnale di partenza, solo se sono qui in tempo reale
    beepedFor = null;
    restToWork(st).then(draw);
    return;
  }
  if (st.phase === 'work' && left <= 0) {
    if (left > -5) beep(660, 3);
    finishWork(st);
    return;
  }
  const work = st.phase === 'work';
  const over = left <= 0;
  if (over && beepedFor !== phaseKey) { beepedFor = phaseKey; if (-left < 5) beep(); }
  const time = over ? '+' + fmtSec(-left) : fmtSec(left);
  const pct = st.duration ? Math.min(1, elapsed / st.duration) : 1;
  const stateText = work ? 'Lavoro' : over ? 'Recupero finito: vai!' : 'Recupero';

  const box = bar();
  box.classList.toggle('over', over && !work);
  box.classList.toggle('work', work);
  box.querySelector('.t-time').textContent = time;
  box.querySelector('.t-label').textContent = work ? `Lavoro · ${st.label || ''}` : over ? 'Recupero finito: vai!' : `Recupero · ${st.label || ''}`;
  box.querySelector('.bar i').style.width = pct * 100 + '%';

  if (full && !full.hidden) {
    full.classList.toggle('over', over && !work);
    full.classList.toggle('work', work);
    full.querySelector('.tf-time').textContent = time;
    full.querySelector('.tf-state').textContent = stateText;
    full.querySelector('.tf-label').textContent = st.label || '';
    full.querySelector('.tf-ring-fg').style.strokeDashoffset = String(RING * pct);
    full.querySelector('.tf-total').textContent = `${work ? 'Lavoro' : 'Previsto'} ${fmtSec(st.duration)}`;
    const nx = full.querySelector('.tf-next');
    const nextText = work ? '' : st.work ? `${st.next} · parte da sola` : st.next;
    nx.hidden = !nextText;
    nx.querySelector('span').textContent = nextText || '';
    full.querySelector('.tf-skip').textContent = work ? 'Serie finita' : st.work ? 'Inizia ora' : 'Fine recupero';
  }
}

async function skip() {
  const st = load();
  if (!st) return;
  if (st.phase === 'rest' && st.work) {
    // salto il resto del recupero e parte subito il lavoro
    st.duration = (Date.now() - st.start) / 1000;
    save(st);
    draw();
  } else if (st.phase === 'work') {
    st.duration = (Date.now() - st.start) / 1000;
    st.work.seconds = Math.max(1, Math.round(st.duration)); // secondi davvero lavorati
    save(st);
    finishWork(st);
  } else {
    stopTimer();
  }
}

export function openFull() {
  if (!load()) return;
  if (!full) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 260 260');
    svg.setAttribute('class', 'tf-ring');
    for (const cls of ['tf-ring-bg', 'tf-ring-fg']) {
      const c = document.createElementNS(svgNS, 'circle');
      c.setAttribute('cx', '130'); c.setAttribute('cy', '130'); c.setAttribute('r', '120');
      c.setAttribute('class', cls);
      svg.append(c);
    }
    svg.querySelector('.tf-ring-fg').style.strokeDasharray = String(RING);
    full = h('div.timer-full', { role: 'dialog', 'aria-label': 'Timer' },
      h('div.tf-top',
        h('span.tf-state', 'Recupero'),
        h('button.tf-close', { onclick: closeFull, 'aria-label': 'Riduci' }, 'Riduci ⌄')),
      h('div.tf-label', ''),
      h('div.tf-clock', svg, h('div.tf-center', h('div.tf-time', '0:00'), h('div.tf-total', ''))),
      h('div.tf-adjust',
        h('button', { onclick: () => adjust(-15) }, '−15"'),
        h('button', { onclick: () => adjust(15) }, '+15"'),
        h('button', { onclick: () => adjust(30) }, '+30"')),
      h('div.tf-next', h('small', 'Prossima serie'), h('span', '')),
      h('div.tf-actions',
        h('button.tf-stop', { onclick: () => stopTimer() }, 'Stop'),
        h('button.tf-skip', { onclick: skip }, 'Fine recupero')));
    document.body.append(full);
  }
  full.hidden = false;
  document.body.classList.add('no-scroll');
  draw();
}

export function closeFull() {
  if (full) full.hidden = true;
  document.body.classList.remove('no-scroll');
}

export function show() {
  const box = bar();
  if (!box.firstChild) {
    const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
    box.append(
      h('span.t-time', '0:00'),
      h('span.t-label', ''),
      h('button', { onclick: stop(() => adjust(-15)), 'aria-label': 'Meno 15 secondi' }, '−15'),
      h('button', { onclick: stop(() => adjust(15)), 'aria-label': 'Più 15 secondi' }, '+15'),
      h('button', { onclick: stop(() => stopTimer()) }, 'Stop'),
      h('div.bar', h('i')),
    );
    box.addEventListener('click', openFull);
  }
  box.hidden = false;
  draw();
  clearInterval(tick);
  tick = setInterval(draw, 250);
}

function hide() {
  clearInterval(tick);
  tick = null;
  const box = bar();
  if (box) box.hidden = true;
  closeFull();
}

// Alla riapertura dell'app il timer riprende da dove deve essere.
export function restoreTimer() {
  const st = load();
  if (!st) return;
  // non suonare per una fase già finita da un pezzo
  if ((Date.now() - st.start) / 1000 > st.duration + 5) beepedFor = `${st.phase}|${st.start}`;
  show();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && load()) draw(); });
