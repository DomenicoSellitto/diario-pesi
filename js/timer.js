// Timer di recupero.
// Il tempo si calcola dai timestamp (Date.now()), non da un contatore:
// così resta giusto anche se iOS sospende l'app in background.
import { h, fmtSec } from './ui.js';
import { get, put } from './db.js';

const KEY = 'diario-pesi-timer';
let tick = null;
let audio = null;
let beeped = false;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}
function save(state) {
  if (state) localStorage.setItem(KEY, JSON.stringify(state));
  else localStorage.removeItem(KEY);
}

export function timerState() { return load(); }

// Avvia il recupero dopo una serie. setId = la serie a cui verrà associato il recupero effettivo.
export function startTimer({ setId, duration, label }) {
  unlockAudio();
  save({ setId, duration, label, start: Date.now() });
  beeped = false;
  show();
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

function el() { return document.getElementById('timer'); }

function draw() {
  const st = load();
  const box = el();
  if (!st) { hide(); return; }
  const elapsed = (Date.now() - st.start) / 1000;
  // Dimenticato acceso da più di 10 minuti oltre il previsto: lo chiudo senza salvare.
  if (elapsed > st.duration + 600) { save(null); hide(); return; }
  const left = st.duration - elapsed;
  const over = left <= 0;
  if (over && !beeped) { beeped = true; if (elapsed - st.duration < 5) beep(); }
  box.classList.toggle('over', over);
  box.querySelector('.t-time').textContent = over ? '+' + fmtSec(-left) : fmtSec(left);
  box.querySelector('.t-label').textContent = over ? 'Recupero finito: vai!' : `Recupero · ${st.label || ''}`;
  const pct = st.duration ? Math.min(100, (elapsed / st.duration) * 100) : 100;
  box.querySelector('.bar i').style.width = pct + '%';
}

export function show() {
  const box = el();
  if (!box.firstChild) {
    box.append(
      h('span.t-time', '0:00'),
      h('span.t-label', ''),
      h('button', { onclick: () => adjust(-15), 'aria-label': 'Meno 15 secondi' }, '−15'),
      h('button', { onclick: () => adjust(15), 'aria-label': 'Più 15 secondi' }, '+15'),
      h('button', { onclick: () => stopTimer() }, 'Stop'),
      h('div.bar', h('i')),
    );
  }
  box.hidden = false;
  draw();
  clearInterval(tick);
  tick = setInterval(draw, 250);
}

function hide() {
  clearInterval(tick);
  tick = null;
  const box = el();
  if (box) box.hidden = true;
}

// Alla riapertura dell'app il timer riprende da dove deve essere.
export function restoreTimer() {
  const st = load();
  if (!st) return;
  beeped = (Date.now() - st.start) / 1000 > st.duration; // non suonare per un recupero già finito
  show();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && load()) draw(); });
