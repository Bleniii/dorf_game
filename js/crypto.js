// crypto.js — Normalisierung, Schlüsselableitung, AES-GCM.
//
// WICHTIG: Diese Datei wird von js/app.js UND von tools/build.html benutzt.
// Sie ist die einzige Quelle der Wahrheit. Wenn sich hier etwas ändert,
// passen alle bereits erzeugten Payloads nicht mehr. Nie duplizieren.

export const KDF_ITERATIONS = 250000;

// Normalisierung der Lösungswörter.
//
// Die Reihenfolge der Schritte ist nicht beliebig:
//   1. NFC   – Handytastaturen liefern "ä" teils als ein Zeichen, teils als
//              "a" + Kombinationszeichen. Ohne diesen Schritt greift die
//              Ersetzung in Schritt 3 nur bei einer der beiden Varianten.
//   2. lower – vor der Ersetzung, damit "Ä" mitgenommen wird.
//   3. ae/oe/ue/ss – deutsche Digraphen VOR dem Akzent-Strippen, sonst
//              würde "ä" in Schritt 4 zu "a" statt zu "ae".
//   4. NFD + Akzente weg – fängt é, à, ç aus Ortsnamen ab.
//   5. nur a-z0-9 – entfernt Punkte, Bindestriche, Leerzeichen.
//              "St. Niklaus", "st niklaus" und "ST-NIKLAUS" werden identisch.
export function normalize(input) {
  return String(input ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export const b64ToBytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const bytesToB64 = (b) => {
  const bytes = new Uint8Array(b);
  let out = '';
  // Nicht String.fromCharCode(...bytes): bei grossen Payloads sprengt der
  // Spread das Argument-Limit der Engine ("too many arguments").
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(out);
};

// Aus welchem String wird der Schlüssel für Station `index` abgeleitet?
// Ohne Verkettung: nur das Wort dieser Station.
// Mit Verkettung: Wort der Vorstation + "|" + Wort dieser Station.
// Gibt null zurück, wenn die Verkettung nicht erfüllbar ist – der Aufrufer
// überspringt diese Station dann, ohne eine teure Ableitung zu starten.
export function secretFor(index, words, input, chain) {
  const word = normalize(input);
  if (!word) return null;
  if (!chain || index === 0) return word;
  const prev = words[index - 1];
  return prev ? `${prev}|${word}` : null;
}

async function deriveKey(secret, salt, iterations, usages) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    usages
  );
}

export async function encryptBlock(payload, secret, iterations = KDF_ITERATIONS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(secret, salt, iterations, ['encrypt']);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(payload))
  );
  return { salt: bytesToB64(salt), iv: bytesToB64(iv), ct: bytesToB64(ct) };
}

// Wirft bei falschem Schlüssel. Das ist kein Fehler, sondern das Prüfverfahren:
// der Auth-Tag von AES-GCM ist gleichzeitig die Passwortprüfung.
export async function decryptBlock(block, secret, iterations = KDF_ITERATIONS) {
  const key = await deriveKey(secret, b64ToBytes(block.salt), iterations, ['decrypt']);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(block.iv) },
    key,
    b64ToBytes(block.ct)
  );
  return JSON.parse(new TextDecoder().decode(plain));
}
