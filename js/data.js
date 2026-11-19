// Letture e calcoli sui dati salvati.
import { all, get, byIndex } from './db.js';
import { epley } from './ui.js';

export async function exercisesMap() {
  const list = await all('exercises');
  return new Map(list.map(e => [e.id, e]));
}

export async function activeTemplates() {
  const list = await all('templates');
  return list.filter(t => t.status === 'active').sort((a, b) => a.name.localeCompare(b.name));
}

export async function sessionsSorted() {
  const list = await all('sessions');
  return list.sort((a, b) => b.start.localeCompare(a.start));
}

export async function openSession() {
  const list = await sessionsSorted();
  return list.find(s => !s.end) || null;
}

export async function setsOfSession(sessionId) {
  const list = await byIndex('sets', 'sessionId', sessionId);
  return list.sort((a, b) => a.exerciseId.localeCompare(b.exerciseId) || a.setNumber - b.setNumber);
}

// Tutte le serie di un esercizio, raggruppate per sessione (dalla più recente).
export async function historyOf(exerciseId) {
  const sets = await byIndex('sets', 'exerciseId', exerciseId);
  const bySession = new Map();
  for (const s of sets) {
    if (!bySession.has(s.sessionId)) bySession.set(s.sessionId, []);
    bySession.get(s.sessionId).push(s);
  }
  const out = [];
  for (const [sessionId, list] of bySession) {
    const session = await get('sessions', sessionId);
    if (!session) continue;
    list.sort((a, b) => a.setNumber - b.setNumber);
    out.push({ session, sets: list });
  }
  return out.sort((a, b) => b.session.start.localeCompare(a.session.start));
}

// Le serie della volta precedente (sessione diversa da quella corrente).
export async function previousSets(exerciseId, currentSessionId) {
  const hist = await historyOf(exerciseId);
  const prev = hist.find(h => h.session.id !== currentSessionId);
  return prev ? prev.sets : [];
}

// Migliori valori registrati prima di una certa sessione (per i record).
export function bestOf(sets) {
  let e1rm = 0, weight = 0, reps = 0;
  for (const s of sets) {
    if (s.weight) weight = Math.max(weight, s.weight);
    const e = epley(s.weight, s.reps);
    if (e) e1rm = Math.max(e1rm, e);
    if (!s.weight && s.reps) reps = Math.max(reps, s.reps);
  }
  return { e1rm, weight, reps };
}

export function sessionVolume(sets) {
  return sets.reduce((sum, s) => sum + (s.weight && s.reps ? s.weight * s.reps : 0), 0);
}
