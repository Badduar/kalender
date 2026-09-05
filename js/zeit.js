// ============================================================
//  Datum und Uhrzeit
// ============================================================
//  Gespeichert wird alles in UTC. Gerechnet und angezeigt wird in
//  Europe/Berlin - unabhaengig davon, wie das Geraet eingestellt ist.
//
//  "Schluessel" ist durchgaengig ein Datum als "JJJJ-MM-TT" in Berliner
//  Ortszeit. Rechnen mit Schluesseln ist zeitzonenfrei und damit sicher.
// ============================================================

import { ZEITZONE } from "./konfig.js";

// Formatierer sind teuer, deshalb je Zeitzone einmal erzeugen und merken.
const FORMAT_CACHE = new Map();

function teileFormat(zone) {
  let format = FORMAT_CACHE.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    FORMAT_CACHE.set(zone, format);
  }
  return format;
}

const TEILE_FORMAT = teileFormat(ZEITZONE);

const UHRZEIT_FORMAT = new Intl.DateTimeFormat("de-DE", {
  timeZone: ZEITZONE, hour: "2-digit", minute: "2-digit",
});

const LANG_FORMAT = new Intl.DateTimeFormat("de-DE", {
  timeZone: ZEITZONE, weekday: "long", day: "numeric", month: "long", year: "numeric",
});

export const WOCHENTAGE_KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
export const WOCHENTAGE_LANG = [
  "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag",
];
export const MONATE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

// ------------------------------------------------------------
//  Umrechnung zwischen Zeitpunkt und Berliner Wanduhrzeit
// ------------------------------------------------------------

// Zerlegt einen Zeitpunkt in die Uhrzeit, die in Berlin auf der Uhr steht.
export function teile(zeitpunkt) {
  return teileInZone(ZEITZONE, zeitpunkt, TEILE_FORMAT);
}

// Dasselbe fuer eine beliebige Zeitzone - wird beim ICS-Import gebraucht.
export function teileInZone(zone, zeitpunkt, format = teileFormat(zone)) {
  const p = {};
  for (const t of format.formatToParts(zeitpunkt)) p[t.type] = t.value;
  return {
    jahr: +p.year,
    monat: +p.month,
    tag: +p.day,
    stunde: p.hour === "24" ? 0 : +p.hour,
    minute: +p.minute,
    sekunde: +p.second,
  };
}

// Wie weit liegt die Zone zu diesem Zeitpunkt vor UTC (in Minuten)?
function versatzMinuten(zone, zeitpunkt) {
  const t = teileInZone(zone, zeitpunkt);
  const alsWaereEsUtc = Date.UTC(t.jahr, t.monat - 1, t.tag, t.stunde, t.minute, t.sekunde);
  return (alsWaereEsUtc - Math.floor(zeitpunkt.getTime() / 1000) * 1000) / 60000;
}

// Wanduhrzeit in einer Zone -> echter Zeitpunkt.
// Zwei Durchlaeufe, weil der Versatz an den Umstellungstagen selbst
// vom Ergebnis abhaengt. Beim doppelten Herbst-Stundenwechsel wird die
// erste (Sommerzeit-)Variante genommen.
export function vonWanduhrInZone(zone, jahr, monat, tag, stunde = 0, minute = 0) {
  const grob = Date.UTC(jahr, monat - 1, tag, stunde, minute);
  const ersterVersuch = new Date(grob - versatzMinuten(zone, new Date(grob)) * 60000);
  return new Date(grob - versatzMinuten(zone, ersterVersuch) * 60000);
}

// Berliner Wanduhrzeit -> echter Zeitpunkt.
export function vonWanduhr(jahr, monat, tag, stunde = 0, minute = 0) {
  return vonWanduhrInZone(ZEITZONE, jahr, monat, tag, stunde, minute);
}

// Prueft, ob die Umgebung eine Zeitzone kennt. Unbekannte TZID aus
// fremden Kalenderdateien fallen sonst still auf UTC zurueck.
export function zoneBekannt(zone) {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------
//  Schluessel (JJJJ-MM-TT)
// ------------------------------------------------------------

export function schluesselVon(zeitpunkt) {
  const t = teile(zeitpunkt);
  return `${t.jahr}-${String(t.monat).padStart(2, "0")}-${String(t.tag).padStart(2, "0")}`;
}

export function schluesselTeile(schluessel) {
  const [jahr, monat, tag] = schluessel.split("-").map(Number);
  return { jahr, monat, tag };
}

export function schluesselAus(jahr, monat, tag) {
  return `${jahr}-${String(monat).padStart(2, "0")}-${String(tag).padStart(2, "0")}`;
}

// Rechnen mit Tagen - ueber UTC, damit keine Zeitzone hineinfunkt.
export function tagPlus(schluessel, tage) {
  const { jahr, monat, tag } = schluesselTeile(schluessel);
  return new Date(Date.UTC(jahr, monat - 1, tag + tage)).toISOString().slice(0, 10);
}

export function monatPlus(schluessel, monate) {
  const { jahr, monat, tag } = schluesselTeile(schluessel);
  return new Date(Date.UTC(jahr, monat - 1 + monate, tag)).toISOString().slice(0, 10);
}

export function tageDazwischen(vonSchluessel, bisSchluessel) {
  const a = schluesselTeile(vonSchluessel);
  const b = schluesselTeile(bisSchluessel);
  return Math.round(
    (Date.UTC(b.jahr, b.monat - 1, b.tag) - Date.UTC(a.jahr, a.monat - 1, a.tag)) / 86400000,
  );
}

// 0 = Montag ... 6 = Sonntag
export function wochentag(schluessel) {
  const { jahr, monat, tag } = schluesselTeile(schluessel);
  return (new Date(Date.UTC(jahr, monat - 1, tag)).getUTCDay() + 6) % 7;
}

export function heuteSchluessel() {
  return schluesselVon(new Date());
}

// Zeitpunkt fuer Mitternacht (Berlin) eines Schluessels.
export function tagesBeginn(schluessel, stunde = 0, minute = 0) {
  const { jahr, monat, tag } = schluesselTeile(schluessel);
  return vonWanduhr(jahr, monat, tag, stunde, minute);
}

// ------------------------------------------------------------
//  Zeitraeume fuer die Ansichten
// ------------------------------------------------------------

export function wochenAnfang(schluessel) {
  return tagPlus(schluessel, -wochentag(schluessel));
}

// 42 Tage: der angezeigte Monat plus die angeschnittenen Randwochen.
export function monatsRaster(schluessel) {
  const { jahr, monat } = schluesselTeile(schluessel);
  const start = wochenAnfang(schluesselAus(jahr, monat, 1));
  return Array.from({ length: 42 }, (_, i) => tagPlus(start, i));
}

export function wochenRaster(schluessel) {
  const start = wochenAnfang(schluessel);
  return Array.from({ length: 7 }, (_, i) => tagPlus(start, i));
}

// ------------------------------------------------------------
//  Anzeige
// ------------------------------------------------------------

export function uhrzeit(zeitpunkt) {
  return UHRZEIT_FORMAT.format(zeitpunkt);
}

export function datumLang(schluessel) {
  return LANG_FORMAT.format(tagesBeginn(schluessel, 12));
}

export function datumKurz(schluessel) {
  const { jahr, monat, tag } = schluesselTeile(schluessel);
  return `${tag}.${monat}.${jahr}`;
}

// Minuten seit Mitternacht - fuer die Platzierung im Zeitraster.
export function minutenImTag(zeitpunkt) {
  const t = teile(zeitpunkt);
  return t.stunde * 60 + t.minute;
}

// Wert fuer <input type="datetime-local"> bzw. type="date"
export function fuerEingabe(zeitpunkt, nurDatum = false) {
  const t = teile(zeitpunkt);
  const datum = schluesselAus(t.jahr, t.monat, t.tag);
  if (nurDatum) return datum;
  return `${datum}T${String(t.stunde).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`;
}

// Wert aus <input type="datetime-local"> zurueck in einen Zeitpunkt.
export function ausEingabe(wert) {
  if (!wert) return null;
  const [datum, zeit = "00:00"] = wert.split("T");
  const { jahr, monat, tag } = schluesselTeile(datum);
  const [stunde, minute] = zeit.split(":").map(Number);
  return vonWanduhr(jahr, monat, tag, stunde || 0, minute || 0);
}
