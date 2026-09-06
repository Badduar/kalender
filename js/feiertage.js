// ============================================================
//  Feiertage und Schulferien - Hamburg
// ============================================================
//  Zwei sehr verschiedene Dinge:
//
//  Feiertage werden GERECHNET. Alle beweglichen haengen am
//  Ostersonntag, und der laesst sich fuer jedes Jahr bestimmen.
//  Diese Angaben veralten also nie.
//
//  Schulferien lassen sich NICHT rechnen - sie werden von der
//  Schulbehoerde festgelegt. Deshalb steht unten eine Tabelle.
//  Sie muss irgendwann verlaengert werden, siehe FERIEN_BIS.
// ============================================================

import { schluesselAus, schluesselTeile } from "./zeit.js";

// ------------------------------------------------------------
//  Feiertage
// ------------------------------------------------------------

// Ostersonntag nach der Gaussschen Osterformel
// (Fassung von Meeus/Jones/Butcher, gueltig im Gregorianischen Kalender).
export function ostersonntag(jahr) {
  const a = jahr % 19;
  const b = Math.floor(jahr / 100);
  const c = jahr % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const zaehler = h + l - 7 * m + 114;
  return schluesselAus(jahr, Math.floor(zaehler / 31), (zaehler % 31) + 1);
}

// Die zehn gesetzlichen Feiertage in Hamburg.
// Ostersonntag und Pfingstsonntag stehen bewusst nicht dabei:
// sie sind keine gesetzlichen Feiertage, sondern schlicht Sonntage.
const FESTE = [
  [1, 1, "Neujahr"],
  [5, 1, "Tag der Arbeit"],
  [10, 3, "Tag der Deutschen Einheit"],
  [10, 31, "Reformationstag"],
  [12, 25, "1. Weihnachtstag"],
  [12, 26, "2. Weihnachtstag"],
];

// Abstand in Tagen zum Ostersonntag.
const BEWEGLICHE = [
  [-2, "Karfreitag"],
  [1, "Ostermontag"],
  [39, "Christi Himmelfahrt"],
  [50, "Pfingstmontag"],
];

const jahresCache = new Map();

export function feiertageImJahr(jahr) {
  let karte = jahresCache.get(jahr);
  if (karte) return karte;

  karte = new Map();
  for (const [monat, tag, name] of FESTE) {
    karte.set(schluesselAus(jahr, monat, tag), name);
  }

  const { jahr: oj, monat: om, tag: ot } = schluesselTeile(ostersonntag(jahr));
  for (const [abstand, name] of BEWEGLICHE) {
    // Ueber UTC rechnen, damit keine Zeitzone hineinfunkt.
    const d = new Date(Date.UTC(oj, om - 1, ot + abstand));
    karte.set(d.toISOString().slice(0, 10), name);
  }

  jahresCache.set(jahr, karte);
  return karte;
}

export function feiertagAn(schluessel) {
  return feiertageImJahr(schluesselTeile(schluessel).jahr).get(schluessel) ?? null;
}

// ------------------------------------------------------------
//  Schulferien
// ------------------------------------------------------------
//  Quelle: Ferienordnung fuer die Schuljahre 2024/25 bis 2029/30
//  in Hamburg (Behoerde fuer Schule und Berufsbildung), abgeglichen
//  mit dem Ferienkalender der Kultusministerkonferenz.
//  Angegeben ist jeweils der erste und der letzte Ferientag.
//
//  ZUM VERLAENGERN: neue Zeitraeume unten anfuegen und FERIEN_BIS
//  hochsetzen. Die amtliche Liste steht auf hamburg.de unter
//  "Ferientermine" (Suchbegriff: Ferienordnung Hamburg).

export const FERIEN_BIS = "2030-08-14";

export const SCHULFERIEN = [
  // Schuljahr 2026/2027
  { name: "Herbstferien",            von: "2026-10-19", bis: "2026-10-30" },
  { name: "Weihnachtsferien",        von: "2026-12-21", bis: "2027-01-01" },
  { name: "Halbjahrespause",         von: "2027-01-29", bis: "2027-01-29" },
  { name: "Frühjahrsferien",         von: "2027-03-01", bis: "2027-03-12" },
  { name: "Himmelfahrt/Pfingsten",   von: "2027-05-07", bis: "2027-05-14" },
  { name: "Sommerferien",            von: "2027-07-01", bis: "2027-08-11" },

  // Schuljahr 2027/2028
  { name: "Herbstferien",            von: "2027-10-11", bis: "2027-10-22" },
  { name: "Weihnachtsferien",        von: "2027-12-20", bis: "2027-12-31" },
  { name: "Halbjahrespause",         von: "2028-01-28", bis: "2028-01-28" },
  { name: "Frühjahrsferien",         von: "2028-03-06", bis: "2028-03-17" },
  { name: "Himmelfahrt/Pfingsten",   von: "2028-05-22", bis: "2028-05-26" },
  { name: "Sommerferien",            von: "2028-07-03", bis: "2028-08-11" },

  // Schuljahr 2028/2029
  { name: "Herbstferien",            von: "2028-10-02", bis: "2028-10-13" },
  { name: "Brückentag",              von: "2028-10-30", bis: "2028-10-30" },
  { name: "Weihnachtsferien",        von: "2028-12-18", bis: "2028-12-29" },
  { name: "Halbjahrespause",         von: "2029-02-02", bis: "2029-02-02" },
  { name: "Frühjahrsferien",         von: "2029-03-05", bis: "2029-03-16" },
  { name: "Himmelfahrt/Pfingsten",   von: "2029-05-11", bis: "2029-05-18" },
  { name: "Sommerferien",            von: "2029-07-02", bis: "2029-08-10" },

  // Schuljahr 2029/2030
  { name: "Herbstferien",            von: "2029-10-01", bis: "2029-10-12" },
  { name: "Weihnachtsferien",        von: "2029-12-21", bis: "2030-01-04" },
  { name: "Halbjahrespause",         von: "2030-02-01", bis: "2030-02-01" },
  { name: "Frühjahrsferien",         von: "2030-03-04", bis: "2030-03-15" },
  { name: "Himmelfahrt/Pfingsten",   von: "2030-05-20", bis: "2030-05-24" },
  { name: "Brückentag",              von: "2030-05-31", bis: "2030-05-31" },
  { name: "Sommerferien",            von: "2030-07-04", bis: "2030-08-14" },
];

// Schluessel sind sortierbare Zeichenketten - der Vergleich reicht.
export function ferienAn(schluessel) {
  for (const zeitraum of SCHULFERIEN) {
    if (schluessel >= zeitraum.von && schluessel <= zeitraum.bis) return zeitraum;
  }
  return null;
}

// ------------------------------------------------------------
//  Anzeige-Einstellung
// ------------------------------------------------------------
//  Nur eine Bequemlichkeit fuer dieses Geraet - deshalb localStorage
//  und kein Eintrag in der Datenbank. Ein nicht lesbarer Speicher
//  (privates Fenster, gesperrte Seitendaten) darf nichts kaputtmachen.

const SCHALTER = { feiertage: "kalender.feiertage", ferien: "kalender.ferien" };

export function zeigeFeiertage(neu) {
  return schalter(SCHALTER.feiertage, neu);
}

export function zeigeFerien(neu) {
  return schalter(SCHALTER.ferien, neu);
}

function schalter(name, neu) {
  if (neu !== undefined) {
    try { localStorage.setItem(name, neu ? "1" : "0"); } catch { /* egal */ }
    return neu;
  }
  try { return localStorage.getItem(name) !== "0"; } catch { return true; }
}
