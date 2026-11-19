// Piccoli strumenti per l'interfaccia.

// h('div.card', {onclick}, 'testo', figlio, ...)
export function h(tag, attrs, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function toast(msg, { action, onAction, type, ms = 3500 } = {}) {
  const box = document.getElementById('toasts');
  const t = h('div.toast', { class: type || '' }, h('span', { style: 'flex:1' }, msg));
  if (action) {
    t.append(h('button', { onclick: () => { onAction?.(); t.remove(); } }, action));
  }
  box.append(t);
  setTimeout(() => t.remove(), ms);
  return t;
}

// Numeri: accetta la virgola della tastiera italiana.
export function parseNum(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
export function fmtNum(n, dec = 1) {
  if (n == null) return '–';
  const r = Math.round(n * 10 ** dec) / 10 ** dec;
  return r.toLocaleString('it-IT', { maximumFractionDigits: dec });
}
export function fmtSec(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
export function fmtRest(sec) {
  if (!sec) return '';
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m && s) return `${m}'${s}"`;
  if (m) return `${m}'`;
  return `${s}"`;
}

const dFmt = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
const dFmtY = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
export function fmtDate(iso, withYear = false) {
  const d = new Date(iso);
  return (withYear ? dFmtY : dFmt).format(d);
}
export function todayKey(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// 1RM stimato con la formula di Epley.
export function epley(weight, reps) {
  if (!weight || !reps) return null;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

// Descrizione breve di una serie, es. "80 × 8 @RIR0".
export function setLabel(s, mode = 'reps') {
  if (!s) return '';
  if (mode === 'check') return 'fatto';
  const w = s.weight ? `${fmtNum(s.weight, 2)}` : '0';
  const amount = mode === 'time' ? `${s.durationSec ?? '–'}"` : (s.reps ?? '–');
  const rir = s.rir == null ? '' : ` @RIR${s.rir === 3 ? '3+' : s.rir}`;
  return `${w} × ${amount}${rir}`;
}

export function confirmBox(msg) { return window.confirm(msg); }
