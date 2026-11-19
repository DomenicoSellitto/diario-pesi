// Navigazione con l'hash dell'indirizzo (#/storico, #/sessione/abc...).
// Ogni schermata si registra con route('/percorso/:param', funzione).
// La funzione riceve i parametri e restituisce { title, node, back?, tab?, right? }.

const routes = [];

export function route(pattern, render) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ re, keys, render });
}

export function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

let renderId = 0;
export async function render() {
  const id = ++renderId;
  const path = (location.hash || '#/').slice(1) || '/';
  const view = document.getElementById('view');
  let match = null, params = {};
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) { match = r; r.keys.forEach((k, i) => params[k] = decodeURIComponent(m[i + 1])); break; }
  }
  let out;
  try {
    out = match ? await match.render(params) : { title: 'Pagina non trovata', node: document.createTextNode('') };
  } catch (err) {
    console.error(err);
    out = { title: 'Errore', node: Object.assign(document.createElement('p'), { textContent: 'Qualcosa è andato storto: ' + err.message }) };
  }
  if (id !== renderId) return; // nel frattempo è stata aperta un'altra pagina
  document.getElementById('title').textContent = out.title || 'Diario Pesi';
  const back = document.getElementById('back');
  back.hidden = !out.back;
  back.onclick = () => { if (out.back) go(out.back); };
  const right = document.getElementById('topbar-right');
  right.replaceChildren(...(out.right ? [out.right] : []));
  const tab = out.tab || path.split('/')[1] || 'home';
  document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('active', a.dataset.tab === (tab || 'home')));
  view.replaceChildren(out.node);
  if (!out.keepScroll) window.scrollTo(0, 0);
}

window.addEventListener('hashchange', render);
