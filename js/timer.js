// Timer di recupero: una fascia in basso e, toccandola, una vista a schermo intero.
// Il tempo si calcola dai timestamp (Date.now()), non da un contatore:
// così resta giusto anche se iOS sospende l'app in background.
import { h, fmtSec } from './ui.js';
import { get, put } from './db.js';

const KEY = 'diario-pesi-timer';
let tick = null;
let audio = null;
let beeped = false;
let full = null; // vista a schermo intero, se aperta

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
// setId = la serie a cui verrà associato il recupero effettivo; next = testo della prossima serie.
export function startTimer({ setId, duration, label, next }) {
  unlockAudio();
  save({ setId, duration, label, next: next || '', start: Date.now() });
  beeped = false;
  show();
}

// Aggiorna il testo "prossima serie" senza toccare il tempo.
export function setNext(next) {
  const st = load();
  if (!st) return;
  st.next = next || '';
  save(st);
  draw();
}

// Ferma il timer e salva il recupero effettivo nella serie che lo aveva fatto partire.
export async function stopTimer() {
  const st = load();
  if (!st) return null;
  save(null);
  hide();
  const elapsed = Math.round((Date.now() - st.start) / 1000);
  if (st.setId) {
    const s = await get('sets', st.setId);
    if (s) { s.restSec = elapsed; await put('sets', s); }
  }
  document.dispatchEvent(new CustomEvent('timer-stopped', { detail: { setId: st.setId, elapsed } }));
  return elapsed;
}

function adjust(delta) {
  const st = load();
  if (!st) return;
  st.duration = Math.max(0, st.duration + delta);
  save(st);
  beeped = false;
  draw();
}

function unlockAudio() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch { audio = null; }
}

function beep() {
  if (!audio) return;
  try {
    const t0 = audio.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = 880;
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
  const elapsed = (Date.now() - st.start) / 1000;
  // Dimenticato acceso da più di 10 minuti oltre il previsto: lo chiudo senza salvare.
  if (elapsed > st.duration + 600) { save(null); hide(); return; }
  const left = st.duration - elapsed;
  const over = left <= 0;
  if (over && !beeped) { beeped = true; if (elapsed - st.duration < 5) beep(); }
  const time = over ? '+' + fmtSec(-left) : fmtSec(left);
  const pct = st.duration ? Math.min(1, elapsed / st.duration) : 1;

  const box = bar();
  box.classList.toggle('over', over);
  box.querySelector('.t-time').textContent = time;
  box.querySelector('.t-label').textContent = over ? 'Recupero finito: vai!' : `Recupero · ${st.label || ''}`;
  box.querySelector('.bar i').style.width = pct * 100 + '%';

  if (full) {
    full.classList.toggle('over', over);
    full.querySelector('.tf-time').textContent = time;
    full.querySelector('.tf-state').textContent = over ? 'Recupero finito: vai!' : 'Recupero';
    full.querySelector('.tf-label').textContent = st.label || '';
    full.querySelector('.tf-ring-fg').style.strokeDashoffset = String(RING * pct);
    full.querySelector('.tf-total').textContent = `Previsto ${fmtSec(st.duration)}`;
    const nx = full.querySelector('.tf-next');
    nx.hidden = !st.next;
    nx.querySelector('span').textContent = st.next || '';
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
    full = h('div.timer-full', { role: 'dialog', 'aria-label': 'Recupero' },
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
      h('button.tf-skip', { onclick: () => stopTimer() }, 'Fine recupero'));
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
  beeped = (Date.now() - st.start) / 1000 > st.duration; // non suonare per un recupero già finito
  show();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && load()) draw(); });
