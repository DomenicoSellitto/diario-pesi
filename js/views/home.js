// Schermata "Oggi": scegli la scheda o registra il pugilato con un tocco.
import { route, go } from '../router.js';
import { h, toast, fmtDate, todayKey } from '../ui.js';
import { all, put, del, uid } from '../db.js';
import { activeTemplates, openSession, sessionsSorted } from '../data.js';
import { fmtDuration } from './session.js';

export const BOXING_TYPES = [
  { id: 'tecnica', label: 'Tecnica', day: 1 },
  { id: 'sparring-condizionato', label: 'Sparring condizionato', day: 2 },
  { id: 'sacco', label: 'Sacco – ripetute', day: 3 },
  { id: 'circuito', label: 'Circuito a stazioni', day: 3 },
  { id: 'sparring-libero', label: 'Sparring libero', day: 5 },
];
export const boxingLabel = (id) => BOXING_TYPES.find(t => t.id === id)?.label || id;

const DAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];

export async function startSession(template) {
  const open = await openSession();
  if (open) { go('#/sessione/' + open.id); return; }
  const s = {
    id: uid(), templateId: template.id, templateName: template.name,
    start: new Date().toISOString(), end: null,
    bodyweight: null, note: '', exerciseNotes: {}, extraExercises: [],
  };
  await put('sessions', s);
  go('#/sessione/' + s.id);
}

route('/', async () => {
  const now = new Date();
  const dow = now.getDay();
  const [templates, open, sessions, boxing] = await Promise.all([
    activeTemplates(), openSession(), sessionsSorted(), all('boxing'),
  ]);
  const today = todayKey();
  const node = h('div');

  node.append(h('p.muted', { style: 'margin:4px 4px 0' }, 'Oggi è ' + now.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })));

  if (open) {
    node.append(h('h2', 'In corso'),
      h('button.big-choice.today', { onclick: () => go('#/sessione/' + open.id) },
        h('span.tag', 'Allenamento aperto'),
        h('strong', `Riprendi Scheda ${open.templateName}`),
        h('span.muted.small', `Iniziato ${new Date(open.start).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`)));
  }

  node.append(h('h2', 'Pesi'));
  for (const t of templates) {
    const isToday = t.title && t.title.toLowerCase() === DAYS[dow];
    const main = t.items.filter(i => !i.optional).length;
    node.append(h('button.big-choice', { class: isToday && !open ? 'today' : '', onclick: () => startSession(t) },
      isToday ? h('span.tag', 'Oggi') : null,
      h('strong', `Scheda ${t.name}`),
      h('span.muted.small', `${t.title ? t.title + ' · ' : ''}${main} esercizi + core e stretching`)));
  }
  if (!templates.length) node.append(h('p.muted', 'Nessuna scheda attiva. Creane una da Altro → Schede.'));

  // Pugilato
  node.append(h('h2', 'Pugilato'));
  const doneToday = new Set(boxing.filter(b => b.date === today).map(b => b.type));
  const grid = h('div.grid2');
  for (const t of BOXING_TYPES) {
    const cls = [t.day === dow ? 'today' : '', doneToday.has(t.id) ? 'done' : ''].join(' ');
    grid.append(h('button.boxing-btn', {
      class: cls,
      onclick: async () => {
        const entry = { id: uid(), date: today, type: t.id, ts: new Date().toISOString() };
        await put('boxing', entry);
        toast(`🥊 ${t.label} registrato`, { action: 'Annulla', onAction: async () => { await del('boxing', entry.id); go('#/'); } });
        go('#/');
      },
    }, doneToday.has(t.id) ? '✓ ' : '', t.label));
  }
  node.append(grid);

  // Ultime attività
  const recent = [
    ...sessions.filter(s => s.end).map(s => ({ when: s.start, kind: 'pesi', s })),
    ...boxing.map(b => ({ when: b.ts || b.date, kind: 'box', b })),
  ].sort((a, b) => b.when.localeCompare(a.when)).slice(0, 10);

  node.append(h('h2', 'Ultime attività'));
  if (!recent.length) node.append(h('p.empty', 'Ancora niente. Buon allenamento!'));
  else {
    const ul = h('ul.list.card', { style: 'padding:0 12px' });
    for (const r of recent) {
      if (r.kind === 'pesi') {
        ul.append(h('li', h('a.item', { href: '#/sessione/' + r.s.id },
          h('span', '🏋️'), h('span', { style: 'flex:1' }, `Scheda ${r.s.templateName}`),
          h('span.muted.small', fmtDate(r.s.start) + (r.s.workoutStart ? ' · ' + fmtDuration(new Date(r.s.end) - new Date(r.s.workoutStart)) : '')),
          h('span.chev', '›'))));
      } else {
        ul.append(h('li', h('span', '🥊'), h('span', { style: 'flex:1' }, boxingLabel(r.b.type)),
          h('span.muted.small', fmtDate(r.b.date + 'T12:00:00')),
          h('button.linkbtn.danger', {
            'aria-label': 'Elimina', onclick: async () => {
              if (!confirm('Eliminare questa seduta di pugilato?')) return;
              await del('boxing', r.b.id); go('#/');
            },
          }, '✕')));
      }
    }
    node.append(ul);
  }

  return { title: 'Oggi', node, tab: 'home', keepScroll: true };
});
