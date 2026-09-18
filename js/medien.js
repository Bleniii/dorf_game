// medien.js — Bausteine für Rätsel mit Bildmaterial.
//
// Ein Stationsinhalt kann ein Feld `medien` mitbringen: eine Liste von
// Bausteinen, die nach dem Aufgabentext erscheinen. Unterstützt sind:
//
//   { "art": "bild", "src": "…", "alt": "…", "zoom": true }
//   { "art": "lupe", "src": "…", "alt": "…", "staerke": 3, "unschaerfe": 2.2 }
//
// Die Bilddateien liegen in assets/ und werden aus dem VERSCHLÜSSELTEN
// Inhalt heraus referenziert. Gib ihnen zufällige Namen (z.B. 8 Hexzeichen),
// dann sind sie ohne gelöste Station nicht auffindbar: GitHub Pages listet
// Verzeichnisse nicht auf.

const ASSETS = 'assets/';
const LINSE = 132;            // Durchmesser der Lupe in px

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/* ----------------------------------------------------------- Darstellung */

function bild(b) {
  const src = ASSETS + b.src;
  const alt = esc(b.alt ?? '');
  const bild = `<img src="${esc(src)}" alt="${alt}" loading="lazy" decoding="async">`;
  return `
    <figure class="medium">
      ${b.zoom === false ? bild : `
        <button type="button" class="bildknopf" data-zoom="${esc(src)}"
                aria-label="${alt || 'Bild'} vergrössern">${bild}</button>`}
      ${b.bildunterschrift ? `<figcaption>${esc(b.bildunterschrift)}</figcaption>` : ''}
    </figure>`;
}

function lupe(b) {
  const src = ASSETS + b.src;
  return `
    <figure class="medium lupe" data-src="${esc(src)}"
            data-staerke="${Number(b.staerke) || 3}"
            style="--unschaerfe:${Number(b.unschaerfe) || 2.2}px">
      <div class="lupe-buehne">
        <img src="${esc(src)}" alt="${esc(b.alt ?? '')}" loading="lazy" decoding="async">
        <div class="linse" hidden></div>
      </div>
      <button type="button" class="lupe-schalter" aria-pressed="false">
        <span class="lupe-icon" aria-hidden="true"></span>Lupe
      </button>
      ${b.bildunterschrift ? `<figcaption>${esc(b.bildunterschrift)}</figcaption>` : ''}
    </figure>`;
}

export function renderMedien(blocks) {
  if (!Array.isArray(blocks) || !blocks.length) return '';
  const html = blocks.map((b) => {
    if (b?.art === 'lupe') return lupe(b);
    if (b?.art === 'bild') return bild(b);
    return '';                          // unbekannte Art still überspringen
  }).join('');
  return html ? `<div class="medien">${html}</div>` : '';
}

/* -------------------------------------------------------------- Verhalten */

function wireLupe(fig) {
  const buehne = fig.querySelector('.lupe-buehne');
  const img = fig.querySelector('img');
  const linse = fig.querySelector('.linse');
  const schalter = fig.querySelector('.lupe-schalter');
  const staerke = Number(fig.dataset.staerke) || 3;

  let aktiv = false;

  function bewege(ev) {
    const r = img.getBoundingClientRect();
    if (!r.width) return;
    // Zeigerposition auf das Bild begrenzen, damit die Linse am Rand
    // nicht ins Leere greift.
    const x = Math.min(Math.max(ev.clientX - r.left, 0), r.width);
    const y = Math.min(Math.max(ev.clientY - r.top, 0), r.height);

    linse.style.left = `${x - LINSE / 2}px`;
    linse.style.top = `${y - LINSE / 2}px`;
    // Der Ausschnitt ist ein Hintergrundbild in Originalschärfe – die
    // Unschärfe liegt nur auf dem <img> darunter.
    linse.style.backgroundSize = `${r.width * staerke}px ${r.height * staerke}px`;
    linse.style.backgroundPosition =
      `${-(x * staerke - LINSE / 2)}px ${-(y * staerke - LINSE / 2)}px`;
  }

  function schalte(an) {
    aktiv = an;
    fig.classList.toggle('aktiv', an);
    linse.hidden = !an;
    schalter.setAttribute('aria-pressed', String(an));
  }

  schalter.addEventListener('click', () => schalte(!aktiv));

  buehne.addEventListener('pointerdown', (ev) => {
    if (!aktiv) return;
    buehne.setPointerCapture(ev.pointerId);
    bewege(ev);
  });

  buehne.addEventListener('pointermove', (ev) => {
    if (!aktiv) return;
    // Auf Touch feuert pointermove nur bei aufliegendem Finger, auf der
    // Maus dagegen immer – beides ist hier richtig.
    ev.preventDefault();
    bewege(ev);
  });

  linse.style.backgroundImage = `url("${fig.dataset.src}")`;
}

/* ---------------------------------------------------------- Zoom-Ansicht */

let zoomEl = null;

function zoomAnsicht() {
  if (zoomEl) return zoomEl;

  zoomEl = document.createElement('div');
  zoomEl.className = 'zoom';
  zoomEl.hidden = true;
  zoomEl.innerHTML = `
    <div class="zoom-buehne"><img alt=""></div>
    <div class="zoom-leiste">
      <button type="button" data-z="-" aria-label="Verkleinern">−</button>
      <button type="button" data-z="+" aria-label="Vergrössern">+</button>
      <button type="button" data-z="x" aria-label="Schliessen">Schliessen</button>
    </div>`;
  document.body.appendChild(zoomEl);

  const img = zoomEl.querySelector('img');
  let skala = 1, x = 0, y = 0, zieht = false, startX = 0, startY = 0;

  const anwenden = () => {
    img.style.transform = `translate(${x}px, ${y}px) scale(${skala})`;
  };

  const setzeSkala = (wert) => {
    skala = Math.min(Math.max(wert, 1), 6);
    if (skala === 1) { x = 0; y = 0; }
    anwenden();
  };

  zoomEl.addEventListener('click', (ev) => {
    const z = ev.target.closest('[data-z]')?.dataset.z;
    if (z === '+') setzeSkala(skala * 1.6);
    else if (z === '-') setzeSkala(skala / 1.6);
    else if (z === 'x' || ev.target === zoomEl) schliesse();
  });

  img.addEventListener('pointerdown', (ev) => {
    if (skala === 1) return;
    zieht = true;
    startX = ev.clientX - x;
    startY = ev.clientY - y;
    img.setPointerCapture(ev.pointerId);
  });

  img.addEventListener('pointermove', (ev) => {
    if (!zieht) return;
    ev.preventDefault();
    x = ev.clientX - startX;
    y = ev.clientY - startY;
    anwenden();
  });

  img.addEventListener('pointerup', () => { zieht = false; });
  img.addEventListener('pointercancel', () => { zieht = false; });

  // Doppeltippen schaltet zwischen ganz und dreifach
  let letzter = 0;
  img.addEventListener('pointerup', () => {
    const jetzt = Date.now();
    if (jetzt - letzter < 300) setzeSkala(skala > 1 ? 1 : 3);
    letzter = jetzt;
  });

  zoomEl._oeffne = (src, alt) => {
    img.src = src;
    img.alt = alt || '';
    setzeSkala(1);
    zoomEl.hidden = false;
    document.body.classList.add('zoom-offen');
    zoomEl.querySelector('[data-z="x"]').focus();
  };

  function schliesse() {
    zoomEl.hidden = true;
    document.body.classList.remove('zoom-offen');
  }

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !zoomEl.hidden) schliesse();
  });

  return zoomEl;
}

/* ------------------------------------------------------------------ Start */

export function initMedien(root) {
  root.querySelectorAll('.lupe').forEach(wireLupe);

  root.querySelectorAll('.bildknopf').forEach((knopf) => {
    knopf.addEventListener('click', () => {
      const img = knopf.querySelector('img');
      zoomAnsicht()._oeffne(knopf.dataset.zoom, img?.alt);
    });
  });
}
