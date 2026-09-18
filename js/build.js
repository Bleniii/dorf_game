// build.js — erzeugt data/game.json aus route.json + einem Inhaltspaket.
//
// Trennung der beiden Eingaben ist der Kern des Ganzen:
//   route.json    = Orte und Lösungswörter. Ändert sich nur, wenn du die
//                   Strecke änderst. Solange sie gleich bleibt, bleiben die
//                   gedruckten QR-Codes gültig.
//   pack.json     = Texte. Darf jederzeit ausgetauscht werden.
// Neues Thema = neues Paket, gleiche Route, kein Neudruck.

import { normalize, encryptBlock, secretFor, KDF_ITERATIONS } from './crypto.js';

export function validate(route, pack) {
  const errors = [];
  const warnings = [];

  if (!route?.stations?.length) errors.push('route.stations ist leer.');
  if (!pack?.stations) errors.push('pack.stations fehlt.');
  if (errors.length) return { errors, warnings };

  if (pack.routeId && route.routeId && pack.routeId !== route.routeId) {
    warnings.push(
      `Paket ist für Route "${pack.routeId}" gedacht, gebaut wird "${route.routeId}".`
    );
  }

  const seen = new Map();
  route.stations.forEach((st, i) => {
    const pos = `Station ${i + 1} (${st.id || 'ohne id'})`;
    if (!st.id) errors.push(`${pos}: id fehlt.`);
    if (!pack.stations[st.id]) errors.push(`${pos}: kein Inhalt im Paket.`);

    const w = normalize(st.word);
    if (!w) {
      errors.push(`${pos}: Lösungswort fehlt oder besteht nur aus Sonderzeichen.`);
      return;
    }
    // Zwei Stationen mit demselben Wort wären nicht unterscheidbar: die App
    // probiert Schlüssel gegen alle Stationen und nähme den ersten Treffer.
    if (seen.has(w)) {
      errors.push(`${pos}: Lösungswort ist identisch mit ${seen.get(w)}.`);
    } else {
      seen.set(w, pos);
    }
    if (w.length < 3) {
      warnings.push(`${pos}: Wort "${w}" ist sehr kurz und schnell zu erraten.`);
    }
  });

  const extra = Object.keys(pack.stations).filter(
    (id) => !route.stations.some((st) => st.id === id)
  );
  if (extra.length) warnings.push(`Paket enthält unbenutzte Stationen: ${extra.join(', ')}.`);

  if (route.finale?.word && !normalize(route.finale.word)) {
    errors.push('Finale: Lösungswort besteht nur aus Sonderzeichen.');
  }
  if (route.finale?.word && !pack.finale) {
    warnings.push('Finale-Wort gesetzt, aber kein Finale-Text im Paket.');
  }

  return { errors, warnings };
}

export async function buildGame(route, pack, { onProgress } = {}) {
  const { errors, warnings } = validate(route, pack);
  if (errors.length) throw new Error(errors.join('\n'));

  const iterations = route.kdf?.iterations ?? KDF_ITERATIONS;
  const chain = Boolean(route.chain);
  const words = route.stations.map((st) => normalize(st.word));

  const blocks = [];
  const qr = [];
  const total = route.stations.length + (route.finale?.word ? 1 : 0);

  for (let i = 0; i < route.stations.length; i++) {
    const st = route.stations[i];
    const source = pack.stations[st.id];
    const isLast = i === route.stations.length - 1;

    const payload = {
      ort: source.ort ?? st.label ?? '',
      geschichte: source.geschichte ?? '',
      raetsel: source.raetsel ?? '',
      richtung: source.richtung ?? '',
      tipp: source.tipp ?? '',
      fragment: source.fragment ?? '',
      medien: Array.isArray(source.medien) ? source.medien : []
    };
    if (isLast && (source.finalFrage || pack.finale)) {
      payload.finalFrage = source.finalFrage ?? '';
    }

    const secret = secretFor(i, words, st.word, chain);
    if (!secret) throw new Error(`Station ${i + 1}: Verkettung nicht auflösbar.`);
    blocks.push(await encryptBlock(payload, secret, iterations));

    qr.push({
      id: st.id,
      label: st.label ?? st.id,
      word: words[i],
      found: st.found ?? '',
      url: (route.baseUrl ?? '') + '#w=' + encodeURIComponent(words[i])
    });

    onProgress?.({ done: i + 1, total });
  }

  const game = {
    packId: pack.packId ?? null,
    routeId: route.routeId ?? null,
    builtAt: new Date().toISOString(),
    title: pack.title ?? route.title ?? 'Dorfgeschichte',
    chain,
    kdf: { iterations },
    intro: pack.intro ?? '',
    startPrompt: pack.startPrompt ?? 'Tippe den Startcode von der Karte ein.',
    stations: blocks
  };

  if (route.finale?.word && pack.finale) {
    game.finale = await encryptBlock(
      { text: pack.finale.text ?? '' },
      normalize(route.finale.word),
      iterations
    );
    onProgress?.({ done: total, total });
  }

  return { game, qr, warnings };
}
