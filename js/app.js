import { normalize, decryptBlock, secretFor, KDF_ITERATIONS } from './crypto.js';
import { renderMedien, initMedien } from './medien.js';

const GAME_URL = 'data/game.json';
const KEY_STATE = 'dorfspiel.state.v1';
const KEY_GAME = 'dorfspiel.game.v1';

let game = null;
let busy = false;
let view = { screen: 'home', message: '' };

const blank = () => ({
  v: 1,
  started: false,
  startedAt: null,
  words: [],      // words[i] = normalisiertes Wort, das Station i geöffnet hat
  payloads: {},   // payloads[i] = entschlüsselter Inhalt von Station i
  current: null,  // zuletzt geöffnete Station
  finale: null,   // entschlüsselter Finale-Inhalt
  finished: false
});

let state = blank();

/* ---------------------------------------------------------------- Speicher */

function loadState() {
  try {
    const raw = localStorage.getItem(KEY_STATE);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.v === 1) state = { ...blank(), ...parsed };
    }
  } catch {
    // Beschädigter oder gesperrter Speicher (Privatmodus): neu anfangen.
    // Kein Datenverlust, der nicht durch erneutes Eintippen heilbar ist.
    state = blank();
  }
}

function saveState() {
  try {
    localStorage.setItem(KEY_STATE, JSON.stringify(state));
  } catch {
    // Speicher voll oder blockiert. Das Spiel läuft weiter, nur ohne
    // Gedächtnis über einen Neuladen hinaus. Absichtlich stumm.
  }
}

async function loadGame() {
  try {
    const res = await fetch(GAME_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    game = await res.json();
    try { localStorage.setItem(KEY_GAME, JSON.stringify(game)); } catch {}
  } catch (err) {
    // Kein Netz mitten auf der Route: aus dem Cache weiterspielen.
    const cached = localStorage.getItem(KEY_GAME);
    if (!cached) throw err;
    game = JSON.parse(cached);
  }
}

/* ------------------------------------------------------------- Darstellung */

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Minimales Markup für Autorentexte: Leerzeile = Absatz, **fett**, *kursiv*.
// Erst escapen, dann Markup anwenden – umgekehrt liesse sich HTML einschmuggeln.
function rich(text) {
  return String(text ?? '')
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((p) => '<p>' + esc(p.trim())
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>') + '</p>')
    .join('');
}

const wordForm = (label = 'Lösungswort') => `
  <form class="wordform" data-action="submit-word" novalidate>
    <label class="sr-only" for="word">${esc(label)}</label>
    <input id="word" name="word" type="text" inputmode="text"
           autocomplete="off" autocapitalize="characters" spellcheck="false"
           placeholder="${esc(label)}" ${busy ? 'disabled' : ''}>
    <button type="submit" ${busy ? 'disabled' : ''}>
      ${busy ? 'Prüfe …' : 'Prüfen'}
    </button>
  </form>
  ${view.message ? `<p class="msg" role="status">${esc(view.message)}</p>` : ''}
`;

function screenHome() {
  return `
    ${rich(game.intro)}
    <button data-action="start" class="primary">Spiel starten</button>
  `;
}

function screenStart() {
  return `
    <h2>Der erste Auftrag</h2>
    ${rich(game.startPrompt)}
    ${wordForm('Startcode')}
  `;
}

function screenStation() {
  const p = state.payloads[state.current];
  if (!p) return screenStart();
  const last = Number(state.current) === game.stations.length - 1;
  return `
    <h2>${esc(p.ort)}</h2>
    ${rich(p.geschichte)}
    ${p.fragment ? `<p class="fragment">Bruchstück: <b>${esc(p.fragment)}</b></p>` : ''}
    <div class="task">
      <h3>Dein Auftrag</h3>
      ${rich(p.raetsel)}
      ${renderMedien(p.medien)}
      ${p.richtung ? `<p class="where">${esc(p.richtung)}</p>` : ''}
    </div>
    ${p.tipp ? `<details><summary>Tipp</summary>${rich(p.tipp)}</details>` : ''}
    ${last && p.finalFrage
      ? `<div class="task final">
           <h3>Letzte Frage</h3>
           ${rich(p.finalFrage)}
           ${fragmentList()}
           ${wordForm('Deine Antwort')}
         </div>`
      : wordForm()}
  `;
}

function fragmentList() {
  const parts = Object.keys(state.payloads)
    .sort((a, b) => a - b)
    .map((i) => state.payloads[i].fragment)
    .filter(Boolean);
  if (!parts.length) return '';
  return `<p class="fragment">Gesammelt: ${parts.map(esc).join(' · ')}</p>`;
}

function screenFinale() {
  return `
    <h2>Geschafft</h2>
    ${rich(state.finale && state.finale.text)}
    ${fragmentList()}
    <button data-action="clues">Alle Hinweise nachlesen</button>
  `;
}

function screenClues() {
  const items = Object.keys(state.payloads).sort((a, b) => a - b).map((i) => `
    <article class="clue">
      <h3>${esc(state.payloads[i].ort)}</h3>
      ${rich(state.payloads[i].geschichte)}
    </article>
  `).join('');
  return `
    <h2>Deine Hinweise</h2>
    ${items || '<p>Noch keine Station geöffnet.</p>'}
    <button data-action="back">Zurück</button>
  `;
}

function screenHelp() {
  return `
    <h2>Nicht weiter?</h2>
    <p>Wenn das Spiel deinen Fortschritt vergessen hat, tippe die Wörter
       der bisherigen Stationen einzeln ein – in der Reihenfolge, in der
       du sie gefunden hast.</p>
    <p>Wenn du das Wort hier nicht finden kannst: Gehe zum Ort, den dein
       letzter Auftrag nennt, und scanne den QR-Code dort. Er nimmt dir
       das Rätsel ab.</p>
    ${wordForm('Bekanntes Wort')}
    <button data-action="back">Zurück</button>
    <button data-action="reset" class="quiet">Spiel zurücksetzen</button>
  `;
}

function screenError() {
  return `
    <h2>Spiel nicht geladen</h2>
    <p>Die Spieldaten sind nicht erreichbar und liegen nicht im Zwischenspeicher.
       Verbinde dich einmal mit dem Internet und lade die Seite neu.</p>
    <button data-action="reload">Neu laden</button>
  `;
}

function render() {
  const el = document.getElementById('content');
  const screens = {
    home: screenHome, start: screenStart, station: screenStation,
    finale: screenFinale, clues: screenClues, help: screenHelp, error: screenError
  };
  el.innerHTML = (screens[view.screen] || screenHome)();

  const nav = document.getElementById('nav');
  const showNav = state.started && view.screen !== 'error';
  nav.hidden = !showNav;

  // Bilder und Lupen brauchen nach jedem Neuzeichnen ihre Ereignisse zurück.
  initMedien(el);

  const input = el.querySelector('#word');
  if (input && !busy) input.focus({ preventScroll: true });
}

/* ----------------------------------------------------------------- Ablauf */

// Ein Wort prüfen. Probiert zuerst die erwartete Station – im Normalfall
// ist das genau eine Schlüsselableitung statt fünf.
async function unlock(input) {
  const word = normalize(input);
  if (!word) return { ok: false, reason: 'empty' };

  const iterations = game.kdf?.iterations ?? KDF_ITERATIONS;
  const chain = Boolean(game.chain);
  const count = game.stations.length;
  const expected = state.words.filter(Boolean).length;
  const order = [expected, ...Array.from({ length: count }, (_, i) => i)]
    .filter((i, pos, arr) => i < count && arr.indexOf(i) === pos);

  for (const i of order) {
    const secret = secretFor(i, state.words, word, chain);
    if (!secret) continue;
    try {
      const payload = await decryptBlock(game.stations[i], secret, iterations);
      state.words[i] = word;
      state.payloads[i] = payload;
      state.current = i;
      saveState();
      return { ok: true, index: i };
    } catch {
      // Falscher Schlüssel für diese Station – nächste probieren.
    }
  }

  // Letzte Möglichkeit: das Wort ist die Antwort auf die Schlussfrage.
  if (game.finale) {
    try {
      state.finale = await decryptBlock(game.finale, word, iterations);
      state.finished = true;
      saveState();
      return { ok: true, finale: true };
    } catch {}
  }

  return { ok: false, reason: 'wrong' };
}

async function handleWord(raw) {
  if (busy) return;
  busy = true;
  view.message = '';
  render();

  const result = await unlock(raw);

  busy = false;
  if (result.ok && result.finale) {
    view = { screen: 'finale', message: '' };
  } else if (result.ok && !state.started) {
    // Erster Kontakt (QR am Startpunkt): Station ist entschlüsselt, wird aber
    // erst nach "Spiel starten" gezeigt – so bleibt die Begrüssung erhalten.
    view = { screen: 'home', message: '' };
  } else if (result.ok) {
    view = { screen: 'station', message: '' };
  } else {
    view.message = result.reason === 'empty'
      ? 'Tippe ein Wort ein.'
      : 'Dieses Wort öffnet nichts. Prüfe die Schreibweise oder scanne den QR-Code am Ort.';
  }
  render();
}

function resume() {
  if (state.finished) return { screen: 'finale', message: '' };
  if (state.current !== null && state.payloads[state.current]) {
    return { screen: 'station', message: '' };
  }
  if (state.started) return { screen: 'start', message: '' };
  return { screen: 'home', message: '' };
}

async function route() {
  const hash = location.hash;

  if (hash.startsWith('#w=')) {
    const word = decodeURIComponent(hash.slice(3));
    // Wort aus der Adresszeile entfernen: verhindert, dass ein Neuladen
    // oder ein Blick über die Schulter das Wort erneut preisgibt.
    history.replaceState(null, '', location.pathname + location.search);
    await handleWord(word);
    return;
  }

  if (hash === '#hilfe') { view = { screen: 'help', message: '' }; render(); return; }
  if (hash === '#hinweise') { view = { screen: 'clues', message: '' }; render(); return; }

  view = resume();
  render();
}

document.getElementById('content').addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el || el.tagName === 'FORM') return;
  const action = el.dataset.action;

  if (action === 'start') {
    state.started = true;
    state.startedAt = state.startedAt || new Date().toISOString();
    saveState();
    // Kam der Spieler über den QR-Code am Startpunkt, liegt Station 1 schon
    // entschlüsselt vor und der erste Auftrag erscheint sofort. Ohne QR wird
    // nach dem Startcode auf der Karte gefragt.
    view = state.current !== null && state.payloads[state.current]
      ? { screen: 'station', message: '' }
      : { screen: 'start', message: '' };
    render();
  } else if (action === 'clues') {
    location.hash = '#hinweise';
  } else if (action === 'back') {
    if (location.hash) location.hash = '';
    else { view = resume(); render(); }
  } else if (action === 'reset') {
    if (confirm('Fortschritt wirklich löschen? Alle gefundenen Wörter gehen verloren.')) {
      state = blank();
      saveState();
      location.hash = '';
      view = resume();
      render();
    }
  } else if (action === 'reload') {
    location.reload();
  }
});

document.getElementById('content').addEventListener('submit', (ev) => {
  const form = ev.target.closest('[data-action="submit-word"]');
  if (!form) return;
  ev.preventDefault();
  // Bewusst NICHT über location.hash: eine zweite Eingabe des gleichen
  // Wortes würde keinen hashchange auslösen und der Knopf wirkte kaputt.
  handleWord(form.elements.word.value);
});

window.addEventListener('hashchange', route);

(async function init() {
  loadState();
  try {
    await loadGame();
  } catch {
    view = { screen: 'error', message: '' };
    render();
    return;
  }
  await route();
})();
