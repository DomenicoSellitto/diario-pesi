// Riepilogo settimanale e mensile.
import { route, render } from '../router.js';
import { h, fmtNum, todayKey } from '../ui.js';
import { all } from '../db.js';
import { GROUPS } from '../seed.js';
import { BOXING_TYPES, boxingLabel } from './home.js';

let period = 'week';
let offset = 0;

function range() {
  const now = new Date();
  let from, to;
  if (period === 'week') {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dow = (d.getDay() + 6) % 7; // lunedì = 0
    from = new Date(d); from.setDate(d.getDate() - dow + offset * 7);
    to = new Date(from); to.setDate(from.getDate() + 7);
  } else {
    from = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    to = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  }
  return { from, to };
}

function label({ from, to }) {
  if (period === 'month') {
    const s = from.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
    return s[0].toUpperCase() + s.slice(1);
  }
  const end = new Date(to); end.setDate(end.getDate() - 1);
  const f = (d) => d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  return `${f(from)} – ${f(end)}`;
}

route('/riepilogo', async () => {
  const r = range();
  const [sessions, sets, boxing, exercises] = await Promise.all([all('sessions'), all('sets'), all('boxing'), all('exercises')]);
  const exMap = new Map(exercises.map(e => [e.id, e]));
  const inRange = sessions.filter(s => { const d = new Date(s.start); return d >= r.from && d < r.to; });
  const ids = new Set(inRange.map(s => s.id));
  const mySets = sets.filter(s => ids.has(s.sessionId));
  const fromKey = todayKey(r.from), toKey = todayKey(r.to);
  const myBoxing = boxing.filter(b => b.date >= fromKey && b.date < toKey);

  const volume = mySets.reduce((t, s) => t + (s.weight && s.reps ? s.weight * s.reps : 0), 0);
  const workSets = mySets.filter(s => (exMap.get(s.exerciseId)?.mode || 'reps') !== 'check');
  const byGroup = new Map();
  for (const s of workSets) {
    const g = exMap.get(s.exerciseId)?.group || 'Altro';
    byGroup.set(g, (byGroup.get(g) || 0) + 1);
  }
  const boxingDays = new Set(myBoxing.map(b => b.date)).size;
  const bws = inRange.map(s => s.bodyweight).filter(Boolean);

  const node = h('div');
  const seg = h('div.seg',
    h('button', { class: period === 'week' ? 'on' : '', onclick: () => { period = 'week'; offset = 0; render(); } }, 'Settimana'),
    h('button', { class: period === 'month' ? 'on' : '', onclick: () => { period = 'month'; offset = 0; render(); } }, 'Mese'));
  node.append(seg);
  node.append(h('div.row', { style: 'margin:12px 0' },
    h('button.btn.small', { onclick: () => { offset--; render(); }, 'aria-label': 'Precedente' }, '‹'),
    h('strong.center', { style: 'flex:1' }, label(r)),
    h('button.btn.small', { onclick: () => { offset++; render(); }, disabled: offset >= 0, 'aria-label': 'Successivo' }, '›')));

  node.append(h('div.stats',
    h('div.stat', h('div.v', String(inRange.length)), h('div.k', 'Allenamenti pesi')),
    h('div.stat', h('div.v', String(boxingDays)), h('div.k', 'Giorni di pugilato')),
    h('div.stat', h('div.v', fmtNum(volume, 0)), h('div.k', 'Volume (kg × rip.)')),
    h('div.stat', h('div.v', String(workSets.length)), h('div.k', 'Serie totali')),
    bws.length ? h('div.stat', h('div.v', fmtNum(bws.reduce((a, b) => a + b, 0) / bws.length) + ' kg'), h('div.k', 'Peso corporeo medio')) : null));

  node.append(h('h2', 'Serie per gruppo muscolare'));
  if (!byGroup.size) node.append(h('p.empty', 'Nessuna serie in questo periodo.'));
  else {
    const max = Math.max(...byGroup.values());
    const bars = h('div.card.bars');
    for (const g of [...GROUPS, 'Altro']) {
      const n = byGroup.get(g);
      if (!n) continue;
      bars.append(h('div.b', h('span.name', g), h('span.track', h('i', { style: `width:${(n / max) * 100}%` })), h('span.n', String(n))));
    }
    node.append(bars);
  }

  node.append(h('h2', 'Pugilato'));
  if (!myBoxing.length) node.append(h('p.empty', 'Nessuna seduta di pugilato in questo periodo.'));
  else {
    const ul = h('ul.list.card', { style: 'padding:0 12px' });
    for (const t of BOXING_TYPES) {
      const n = myBoxing.filter(b => b.type === t.id).length;
      if (n) ul.append(h('li', h('span', { style: 'flex:1' }, boxingLabel(t.id)), h('strong', String(n))));
    }
    node.append(ul);
  }

  return { title: 'Riepilogo', node, tab: 'riepilogo' };
});
