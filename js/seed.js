// Esercizi e schede iniziali (vedi CLAUDE.md, "Scheda attuale").
import { all, put, getMeta, setMeta } from './db.js';

export const GROUPS = ['Gambe', 'Glutei', 'Petto', 'Dorso', 'Spalle', 'Bicipiti', 'Tricipiti', 'Core', 'Total body', 'Stretching'];
export const TYPES = ['bilanciere', 'manubri', 'macchina', 'cavo', 'kettlebell', 'corpo libero', 'altro'];

// mode: 'reps' = peso × ripetizioni; 'time' = peso × secondi; 'check' = solo fatto/non fatto
const EX = [
  ['swing-kettlebell', 'Swing con kettlebell', 'Total body', 'kettlebell', 'time'],
  ['box-jump', 'Box jump (60 cm)', 'Gambe', 'corpo libero', 'time'],
  ['panca-piana-manubri', 'Panca piana con manubri', 'Petto', 'manubri', 'reps'],
  ['lat-machine-prona', 'Lat machine presa prona', 'Dorso', 'macchina', 'reps'],
  ['pulley-row', 'Pulley row', 'Dorso', 'cavo', 'reps'],
  ['military-press-manubri', 'Military press con manubri', 'Spalle', 'manubri', 'reps'],
  ['curl-ez', 'Curl con bilanciere EZ', 'Bicipiti', 'bilanciere', 'reps'],
  ['french-press-cavo', 'French press al cavo singolo', 'Tricipiti', 'cavo', 'reps'],
  ['affondi-bulgari', 'Affondi bulgari', 'Gambe', 'manubri', 'reps'],
  ['hip-thrust', 'Hip thrust', 'Glutei', 'bilanciere', 'reps'],
  ['chest-press-inclinata', 'Chest press inclinata', 'Petto', 'macchina', 'reps'],
  ['trazioni', 'Trazioni', 'Dorso', 'corpo libero', 'reps'],
  ['alzate-laterali-cavo', 'Alzate laterali al cavo', 'Spalle', 'cavo', 'reps'],
  ['push-down-cavo', 'Push down al cavo', 'Tricipiti', 'cavo', 'reps'],
  ['curl-panca-45', 'Curl su panca a 45°', 'Bicipiti', 'manubri', 'reps'],
  ['plank', 'Plank', 'Core', 'corpo libero', 'time'],
  ['crunch', 'Crunch', 'Core', 'corpo libero', 'reps'],
  ['stretching', 'Stretching finale', 'Stretching', 'corpo libero', 'check'],
];

// [exerciseId, serie, ripetizioni target, recupero in secondi, opzionale, nota]
const A = [
  ['swing-kettlebell', 4, '40"', 20, false, '40" lavoro, 20" pausa'],
  ['box-jump', 5, '40"', 20, false, '40" lavoro, 20" pausa'],
  ['panca-piana-manubri', 2, '8-10', 120, false, ''],
  ['lat-machine-prona', 2, '8-10', 120, false, ''],
  ['pulley-row', 2, '8-10', 90, false, ''],
  ['military-press-manubri', 2, '8-10', 120, false, ''],
  ['curl-ez', 2, '10', 60, false, ''],
  ['french-press-cavo', 2, '10', 60, false, ''],
  ['plank', 2, '40"', 30, true, 'Core: cambia spesso, puoi aggiungere altri esercizi'],
  ['stretching', 1, '', 0, true, ''],
];
const B = [
  ['affondi-bulgari', 3, '6 + 6', 90, false, '6 rip. col peso + subito 6 senza peso, esplosive. Per gamba.'],
  ['hip-thrust', 3, '8-10', 120, false, 'Carico per lato'],
  ['chest-press-inclinata', 2, '8-10', 120, false, 'Alternata ×3'],
  ['trazioni', 2, 'max', 120, false, 'Peso = zavorra (0 se a corpo libero)'],
  ['alzate-laterali-cavo', 2, '10-12', 60, false, ''],
  ['push-down-cavo', 2, '10', 60, false, ''],
  ['curl-panca-45', 2, '10', 60, false, ''],
  ['crunch', 2, '15', 45, true, 'Core: cambia spesso, puoi aggiungere altri esercizi'],
  ['stretching', 1, '', 0, true, ''],
];

function items(list) {
  return list.map(([exerciseId, sets, reps, restSec, optional, note]) => ({ exerciseId, sets, reps, restSec, optional, note }));
}

export async function seedIfEmpty() {
  if (await getMeta('seeded')) return;
  const existing = await all('exercises');
  if (existing.length === 0) {
    for (const [id, name, group, type, mode] of EX) {
      await put('exercises', { id, name, group, type, mode, note: '' });
    }
    const now = new Date().toISOString();
    await put('templates', { id: 'scheda-a-1', name: 'A', title: 'Giovedì', status: 'active', createdAt: now, archivedAt: null, items: items(A) });
    await put('templates', { id: 'scheda-b-1', name: 'B', title: 'Sabato', status: 'active', createdAt: now, archivedAt: null, items: items(B) });
  }
  await setMeta('seeded', true);
}
