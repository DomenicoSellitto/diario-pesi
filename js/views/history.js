// Storico per esercizio con grafico di 1RM stimato e carico massimo.
import { route, go } from '../router.js';
import { h, toast, fmtNum, fmtDate, fmtRest, setLabel, epley } from '../ui.js';
import { all, get, put } from '../db.js';
import { historyOf, bestOf } from '../data.js';
import { GROUPS, TYPES } from '../seed.js';

route('/storico', async () => {
  const [exercises, sets, templates] = await Promise.all([all('exercises'), all('sets'), all('templates')]);
  const count = new Map();
  for (const s of sets) {
    if (!count.has(s.exerciseId)) count.set(s.exerciseId, new Set());
    count.get(s.exerciseId).add(s.sessionId);
  }
  const inActive = new Set(templates.filter(t => t.status === 'active').flatMap(t => t.items.map(i => i.exerciseId)));
  const visible = exercises.filter(e => count.has(e.id) || inActive.has(e.id));
  const node = h('div');
  node.append(h('p.muted.small', { style: 'margin:4px' }, 'Tocca un esercizio per vedere le sessioni passate e i progressi.'));
  for (const g of GROUPS) {
    const list = visible.filter(e => e.group === g).sort((a, b) => a.name.localeCompare(b.name));
    if (!list.length) continue;
    node.append(h('h2', g));
    const ul = h('ul.list.card', { style: 'padding:0 12px' });
    for (const e of list) {
      const n = count.get(e.id)?.size || 0;
      ul.append(h('li', h('a.item', { href: '#/esercizio/' + e.id },
        h('span', { style: 'flex:1' }, e.name),
        h('span.muted.small', n ? `${n} ${n === 1 ? 'volta' : 'volte'}` : '—'),
        h('span.chev', '›'))));
    }
    node.append(ul);
  }
  return { title: 'Storico', node, tab: 'storico' };
});

function chart(points, { label1, label2 }) {
  // points: [{ date, v1, v2 }] in ordine cronologico
  const W = 340, H = 180, padL = 34, padR = 10, padT = 10, padB = 24;
  const vals = points.flatMap(p => [p.v1, p.v2]).filter(v => v != null);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 5; max += 5; }
  const span = max - min; min = Math.max(0, min - span * 0.1); max += span * 0.1;
  const x = (i) => padL + (points.length === 1 ? (W - padL - padR) / 2 : i * (W - padL - padR) / (points.length - 1));
  const y = (v) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
  const ns = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, text) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text != null) e.textContent = text;
    return e;
  };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'Grafico dei progressi' });
  for (let i = 0; i <= 3; i++) {
    const v = min + (max - min) * i / 3;
    svg.append(el('line', { x1: padL, x2: W - padR, y1: y(v), y2: y(v), class: 'grid' }));
    svg.append(el('text', { x: padL - 4, y: y(v) + 4, 'text-anchor': 'end' }, fmtNum(v, 0)));
  }
  const step = Math.max(1, Math.ceil(points.length / 5));
  points.forEach((p, i) => {
    if (i % step === 0 || i === points.length - 1) {
      const anchor = points.length > 1 && i === 0 ? 'start' : points.length > 1 && i === points.length - 1 ? 'end' : 'middle';
      svg.append(el('text', { x: x(i), y: H - 6, 'text-anchor': anchor }, new Date(p.date).toLocaleDateString('it-IT', { day: 'numeric', month: 'numeric' })));
    }
  });
  for (const [key, cls] of [['v2', '2'], ['v1', '1']]) {
    const pts = points.map((p, i) => p[key] != null ? `${x(i)},${y(p[key])}` : null).filter(Boolean);
    if (!pts.length) continue;
    svg.append(el('polyline', { points: pts.join(' '), class: 'l' + cls }));
    points.forEach((p, i) => { if (p[key] != null) svg.append(el('circle', { cx: x(i), cy: y(p[key]), r: 3.5, class: 'p' + cls })); });
  }
  return h('div', svg, h('div.legend', h('span', h('i'), label1), label2 ? h('span', h('i.l2'), label2) : null));
}

route('/esercizio/:id', async ({ id }) => {
  const ex = await get('exercises', id);
  if (!ex) return { title: 'Esercizio', back: '#/storico', node: h('p.empty', 'Esercizio non trovato.') };
  const mode = ex.mode || 'reps';
  const hist = (await historyOf(id)).filter(e => e.session.end || true);
  const node = h('div');
  const allSets = hist.flatMap(e => e.sets);
  const best = bestOf(allSets);
  const bodyweightOnly = allSets.length && allSets.every(s => !s.weight);

  if (!hist.length) {
    node.append(h('p.empty', 'Ancora nessuna serie registrata per questo esercizio.'));
  } else {
    const last = hist[0];
    const tiles = h('div.stats');
    if (mode === 'reps' && !bodyweightOnly) {
      tiles.append(h('div.stat', h('div.v', fmtNum(best.e1rm) + ' kg'), h('div.k', '1RM stimato (record)')));
      tiles.append(h('div.stat', h('div.v', fmtNum(best.weight, 2) + ' kg'), h('div.k', 'Carico massimo')));
    } else if (mode === 'reps') {
      tiles.append(h('div.stat', h('div.v', String(best.reps)), h('div.k', 'Ripetizioni massime')));
    } else if (mode === 'time') {
      tiles.append(h('div.stat', h('div.v', fmtNum(best.weight, 2) + ' kg'), h('div.k', 'Carico massimo')));
    }
    tiles.append(h('div.stat', h('div.v', String(hist.length)), h('div.k', 'Sessioni')));
    tiles.append(h('div.stat', h('div.v', { style: 'font-size:18px' }, fmtDate(last.session.start)), h('div.k', 'Ultima volta')));
    node.append(tiles);

    if (mode !== 'check') {
      const pts = [...hist].reverse().map(e => {
        const b = bestOf(e.sets);
        if (mode === 'reps' && !bodyweightOnly) return { date: e.session.start, v1: b.e1rm || null, v2: b.weight || null };
        if (mode === 'reps') return { date: e.session.start, v1: Math.max(...e.sets.map(s => s.reps || 0)) };
        return { date: e.session.start, v1: b.weight || null };
      });
      const labels = mode === 'reps' && !bodyweightOnly ? { label1: '1RM stimato (Epley)', label2: 'Carico massimo' }
        : mode === 'reps' ? { label1: 'Ripetizioni massime' } : { label1: 'Carico' };
      if (pts.some(p => p.v1 != null)) node.append(h('h2', 'Andamento'), h('div.card', chart(pts, labels)));
    }

    node.append(h('h2', 'Sessioni'));
    for (const e of hist) {
      const note = e.session.exerciseNotes?.[id];
      node.append(h('a.card.hist-session', { href: '#/sessione/' + e.session.id, style: 'display:block;color:inherit;text-decoration:none' },
        h('div.row', h('span.date', fmtDate(e.session.start, true)), h('span.spacer'), h('span.muted.small', `Scheda ${e.session.templateName}`)),
        h('div.sets', e.sets.map(s => h('div',
          `${s.setNumber}. ${setLabel(s, mode)}`,
          s.restSec ? h('span.muted', ` · rec. ${fmtRest(s.restSec)}`) : null,
          mode === 'reps' && s.weight && s.reps ? h('span.muted', ` · 1RM ≈ ${fmtNum(epley(s.weight, s.reps))}`) : null,
          s.pr ? h('span.pr-badge', ' 🏆') : null,
          s.note ? h('div.muted.small', s.note) : null))),
        note ? h('div.muted.small', { style: 'margin-top:4px' }, '📝 ' + note) : null));
    }
  }

  // Modifica esercizio
  const form = h('div.card',
    h('div.field', h('label', 'Nome'), h('input', { type: 'text', name: 'name', value: ex.name })),
    h('div.field', h('label', 'Gruppo muscolare'), h('select', { name: 'group' }, ...GROUPS.map(g => h('option', { selected: g === ex.group || undefined }, g)))),
    h('div.field', h('label', 'Attrezzo'), h('select', { name: 'type' }, ...TYPES.map(t => h('option', { selected: t === ex.type || undefined }, t)))),
    h('div.field', h('label', 'Si registra con'), h('select', { name: 'mode' },
      h('option', { value: 'reps', selected: mode === 'reps' || undefined }, 'peso × ripetizioni'),
      h('option', { value: 'time', selected: mode === 'time' || undefined }, 'peso × secondi'),
      h('option', { value: 'check', selected: mode === 'check' || undefined }, 'solo "fatto"'))),
    h('div.field', h('label', 'Note (regolazioni, macchina…)'), h('textarea', { name: 'note' })),
    h('button.btn.block', {
      onclick: async () => {
        const name = form.querySelector('[name=name]').value.trim();
        if (!name) return toast('Il nome non può essere vuoto');
        Object.assign(ex, {
          name, group: form.querySelector('[name=group]').value, type: form.querySelector('[name=type]').value,
          mode: form.querySelector('[name=mode]').value, note: form.querySelector('[name=note]').value.trim(),
        });
        await put('exercises', ex);
        toast('Esercizio salvato');
        go('#/esercizio/' + id);
      },
    }, 'Salva modifiche'));
  form.querySelector('[name=note]').value = ex.note || '';
  if (ex.note) node.prepend(h('div.card.small', '📝 ' + ex.note));
  node.append(h('details', { style: 'margin-top:16px' }, h('summary', h('h2', { style: 'display:inline' }, 'Modifica esercizio')), form));

  return { title: ex.name, back: '#/storico', node, tab: 'storico' };
});
