// Schede: elenco, modifica e cambio scheda (la vecchia viene archiviata, non cancellata).
import { route, go } from '../router.js';
import { h, toast, fmtDate, fmtRest, parseNum } from '../ui.js';
import { all, get, put, uid } from '../db.js';
import { GROUPS } from '../seed.js';

route('/schede', async () => {
  const list = await all('templates');
  const active = list.filter(t => t.status === 'active').sort((a, b) => a.name.localeCompare(b.name));
  const archived = list.filter(t => t.status !== 'active').sort((a, b) => (b.archivedAt || '').localeCompare(a.archivedAt || ''));
  const node = h('div');

  node.append(h('h2', 'Schede attive'));
  for (const t of active) {
    node.append(h('div.card',
      h('a', { href: '#/scheda/' + t.id, style: 'color:inherit;text-decoration:none;display:block' },
        h('div.row', h('strong', { style: 'font-size:18px;flex:1' }, `Scheda ${t.name}`), h('span.chev', '›')),
        h('div.muted.small', `${t.title || ''} · in uso dal ${fmtDate(t.createdAt, true)}`)),
      h('button.btn.small', {
        style: 'margin-top:10px',
        onclick: async () => {
          if (!confirm(`Cambiare la Scheda ${t.name}?\n\nLa scheda attuale verrà archiviata (lo storico resta). Partirai da una copia da modificare.`)) return;
          const now = new Date().toISOString();
          t.status = 'archived'; t.archivedAt = now;
          await put('templates', t);
          const fresh = { ...structuredClone(t), id: uid(), status: 'active', createdAt: now, archivedAt: null };
          await put('templates', fresh);
          toast(`Scheda ${t.name} archiviata. Ora modifica quella nuova.`);
          go('#/scheda/' + fresh.id);
        },
      }, `Cambia Scheda ${t.name}`)));
  }
  node.append(h('button.btn.block', {
    onclick: async () => {
      const used = new Set(active.map(t => t.name));
      const name = 'ABCDEFGH'.split('').find(l => !used.has(l)) || 'X';
      const t = { id: uid(), name, title: '', status: 'active', createdAt: new Date().toISOString(), archivedAt: null, items: [] };
      await put('templates', t);
      go('#/scheda/' + t.id);
    },
  }, '+ Nuova scheda'));

  node.append(h('h2', 'Archiviate'));
  if (!archived.length) node.append(h('p.empty', 'Nessuna scheda archiviata.'));
  else {
    const ul = h('ul.list.card', { style: 'padding:0 12px' });
    for (const t of archived) {
      ul.append(h('li', h('a.item', { href: '#/scheda/' + t.id },
        h('span', { style: 'flex:1' }, `Scheda ${t.name}`),
        h('span.muted.small', `${fmtDate(t.createdAt)} → ${t.archivedAt ? fmtDate(t.archivedAt) : ''}`),
        h('span.chev', '›'))));
    }
    node.append(ul);
  }
  return { title: 'Schede', back: '#/altro', node, tab: 'altro' };
});

route('/scheda/:id', async ({ id }) => {
  const t = await get('templates', id);
  if (!t) return { title: 'Scheda', back: '#/schede', node: h('p.empty', 'Scheda non trovata.') };
  const exercises = await all('exercises');
  const exMap = new Map(exercises.map(e => [e.id, e]));
  const draft = structuredClone(t);
  const readOnly = t.status !== 'active';
  const node = h('div');

  if (readOnly) {
    node.append(h('p.muted.small', { style: 'margin:4px' }, `Archiviata il ${fmtDate(t.archivedAt, true)}. Gli esercizi e il loro storico restano disponibili.`));
    const ul = h('div.card');
    t.items.forEach((it, i) => ul.append(h('div', { style: 'padding:6px 0' },
      `${i + 1}. ${exMap.get(it.exerciseId)?.name || it.exerciseId} — ${it.sets} × ${it.reps}`, it.restSec ? ` · rec. ${fmtRest(it.restSec)}` : '', it.optional ? ' (opz.)' : '')));
    node.append(ul);
    return { title: `Scheda ${t.name}`, back: '#/schede', node, tab: 'altro' };
  }

  const head = h('div.card',
    h('div.field', h('label', 'Lettera / nome'), h('input', { type: 'text', value: draft.name, oninput: (e) => { draft.name = e.target.value.trim(); } })),
    h('div.field', h('label', 'Giorno (es. Giovedì)'), h('input', { type: 'text', value: draft.title || '', oninput: (e) => { draft.title = e.target.value.trim(); } })));
  const listBox = h('div');
  node.append(head, h('h2', 'Esercizi in ordine'), listBox);

  function drawList() {
    listBox.replaceChildren();
    draft.items.forEach((it, i) => {
      const ex = exMap.get(it.exerciseId);
      const field = (label, value, onchange, attrs = {}) => h('div.field', h('label', label), h('input', { type: 'text', value: value ?? '', onchange, ...attrs }));
      listBox.append(h('div.card',
        h('div.tpl-item',
          h('div.ord',
            h('button', { 'aria-label': 'Sposta su', disabled: i === 0, onclick: () => { [draft.items[i - 1], draft.items[i]] = [draft.items[i], draft.items[i - 1]]; drawList(); } }, '▲'),
            h('button', { 'aria-label': 'Sposta giù', disabled: i === draft.items.length - 1, onclick: () => { [draft.items[i + 1], draft.items[i]] = [draft.items[i], draft.items[i + 1]]; drawList(); } }, '▼')),
          h('div.name', h('strong', ex?.name || it.exerciseId), h('div.muted.small', ex?.group || '')),
          h('button.linkbtn.danger', { onclick: () => { if (confirm(`Togliere ${ex?.name} dalla scheda?`)) { draft.items.splice(i, 1); drawList(); } } }, 'togli')),
        h('div.mini-fields',
          field('Serie', it.sets, (e) => { it.sets = Math.max(1, Math.round(parseNum(e.target.value) || 1)); }, { inputmode: 'numeric' }),
          field('Ripetizioni', it.reps, (e) => { it.reps = e.target.value.trim(); }),
          field('Recupero (sec)', it.restSec, (e) => { it.restSec = Math.round(parseNum(e.target.value) || 0); }, { inputmode: 'numeric' })),
        h('div.field', { style: 'margin:8px 0 0' }, h('input', { type: 'text', placeholder: 'Nota (facoltativa)', value: it.note || '', onchange: (e) => { it.note = e.target.value.trim(); } })),
        h('label.checkline', h('input', { type: 'checkbox', checked: !!it.optional, onchange: (e) => { it.optional = e.target.checked; } }), 'Opzionale ("se c\'è tempo")')));
    });
    if (!draft.items.length) listBox.append(h('p.empty', 'Nessun esercizio. Aggiungine uno qui sotto.'));
  }
  drawList();

  // Aggiungi esercizio
  const sel = h('select', h('option', { value: '' }, 'Scegli un esercizio…'),
    ...GROUPS.map(g => {
      const l = exercises.filter(e => e.group === g).sort((a, b) => a.name.localeCompare(b.name));
      return l.length ? h('optgroup', { label: g }, ...l.map(e => h('option', { value: e.id }, e.name))) : null;
    }),
    h('option', { value: '__new' }, '+ Nuovo esercizio…'));
  const newBox = h('div', { hidden: true },
    h('div.field', h('label', 'Nome'), h('input', { type: 'text', name: 'name' })),
    h('div.field', h('label', 'Gruppo muscolare'), h('select', { name: 'group' }, ...GROUPS.map(g => h('option', g)))),
    h('div.field', h('label', 'Si registra con'), h('select', { name: 'mode' },
      h('option', { value: 'reps' }, 'peso × ripetizioni'), h('option', { value: 'time' }, 'peso × secondi'), h('option', { value: 'check' }, 'solo "fatto"'))));
  sel.addEventListener('change', () => { newBox.hidden = sel.value !== '__new'; });
  node.append(h('h2', 'Aggiungi esercizio'), h('div.card',
    h('p.small.muted', { style: 'margin-top:0' }, 'Se scegli un esercizio che hai già fatto, il suo storico continua.'),
    h('div.field', sel), newBox,
    h('button.btn.block', {
      onclick: async () => {
        let exId = sel.value;
        if (!exId) return toast('Scegli un esercizio');
        if (exId === '__new') {
          const name = newBox.querySelector('[name=name]').value.trim();
          if (!name) return toast('Scrivi il nome');
          exId = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid();
          if (exMap.has(exId)) exId += '-' + uid().slice(-4);
          const ex = { id: exId, name, group: newBox.querySelector('[name=group]').value, type: 'altro', mode: newBox.querySelector('[name=mode]').value, note: '' };
          await put('exercises', ex);
          exMap.set(exId, ex);
        }
        draft.items.push({ exerciseId: exId, sets: 2, reps: '8-10', restSec: 120, optional: false, note: '' });
        sel.value = ''; newBox.hidden = true;
        drawList();
      },
    }, 'Aggiungi alla scheda')));

  node.append(h('div', { style: 'margin-top:16px' }, h('button.btn.primary.block', {
    onclick: async () => {
      if (!draft.name) return toast('Dai un nome alla scheda');
      await put('templates', draft);
      toast('Scheda salvata');
      go('#/schede');
    },
  }, 'Salva scheda')));

  return { title: `Scheda ${t.name}`, back: '#/schede', node, tab: 'altro' };
});
