// Elenco degli esercizi: aggiungerne di nuovi (per usarli poi nelle schede), modificarli, eliminarli se mai usati.
import { route, go } from '../router.js';
import { h, toast } from '../ui.js';
import { all, put, del, uid } from '../db.js';
import { GROUPS, TYPES } from '../seed.js';
import { setExerciseBack } from './history.js';

export function slugId(name, existing) {
  let id = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || uid();
  if (existing.has(id)) id += '-' + uid().slice(-4);
  return id;
}

route('/esercizi', async () => {
  setExerciseBack('#/esercizi');
  const [exercises, sets, templates] = await Promise.all([all('exercises'), all('sets'), all('templates')]);
  const used = new Set(sets.map(s => s.exerciseId));
  const inTemplates = new Set(templates.flatMap(t => t.items.map(i => i.exerciseId)));
  const ids = new Set(exercises.map(e => e.id));
  const node = h('div');

  // Nuovo esercizio
  const form = h('div.card',
    h('div.field', h('label', 'Nome'), h('input', { type: 'text', name: 'name', placeholder: 'es. Rematore con manubrio' })),
    h('div.field', h('label', 'Gruppo muscolare'), h('select', { name: 'group' }, ...GROUPS.map(g => h('option', g)))),
    h('div.field', h('label', 'Attrezzo'), h('select', { name: 'type' }, ...TYPES.map(t => h('option', t)))),
    h('div.field', h('label', 'Si registra con'), h('select', { name: 'mode' },
      h('option', { value: 'reps' }, 'peso × ripetizioni'),
      h('option', { value: 'time' }, 'peso × secondi (a tempo)'),
      h('option', { value: 'check' }, 'solo "fatto"'))),
    h('div.field', h('label', 'Note (facoltative)'), h('input', { type: 'text', name: 'note', placeholder: 'regolazioni, macchina…' })),
    h('button.btn.primary.block', {
      onclick: async () => {
        const name = form.querySelector('[name=name]').value.trim();
        if (!name) return toast('Scrivi il nome dell\'esercizio');
        if (exercises.some(e => e.name.toLowerCase() === name.toLowerCase())) return toast('Esiste già un esercizio con questo nome');
        const ex = {
          id: slugId(name, ids), name,
          group: form.querySelector('[name=group]').value,
          type: form.querySelector('[name=type]').value,
          mode: form.querySelector('[name=mode]').value,
          note: form.querySelector('[name=note]').value.trim(),
        };
        await put('exercises', ex);
        toast(`${name} aggiunto: lo trovi quando modifichi o crei una scheda`, { ms: 4500 });
        go('#/esercizi');
      },
    }, 'Aggiungi esercizio'));
  node.append(h('details', { open: exercises.length < 1 || undefined },
    h('summary', h('h2', { style: 'display:inline-block' }, '+ Nuovo esercizio')), form));

  // Elenco per gruppo
  for (const g of GROUPS) {
    const list = exercises.filter(e => e.group === g).sort((a, b) => a.name.localeCompare(b.name));
    if (!list.length) continue;
    node.append(h('h2', g));
    const ul = h('ul.list.card', { style: 'padding:0 12px' });
    for (const e of list) {
      const free = !used.has(e.id) && !inTemplates.has(e.id);
      ul.append(h('li',
        h('a.item', { href: '#/esercizio/' + e.id },
          h('span', { style: 'flex:1' }, e.name),
          h('span.muted.small', e.mode === 'time' ? 'a tempo' : e.mode === 'check' ? 'fatto' : e.type || '')),
        free ? h('button.linkbtn.danger', {
          'aria-label': `Elimina ${e.name}`,
          onclick: async () => {
            if (!confirm(`Eliminare ${e.name}? Non è mai stato usato.`)) return;
            await del('exercises', e.id);
            go('#/esercizi');
          },
        }, '✕') : h('span.chev', '›')));
    }
    node.append(ul);
  }
  node.append(h('p.muted.small', { style: 'margin:12px 4px' },
    'Gli esercizi già usati o presenti in una scheda non si possono eliminare, per non perdere lo storico. Toccali per modificarli.'));

  return { title: 'Esercizi', back: '#/altro', node, tab: 'altro' };
});
