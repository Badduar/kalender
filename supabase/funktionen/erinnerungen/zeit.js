// Auszug aus ../../../js/zeit.js - nur das, was serie.js braucht.
//
// Warum eine Kopie? Der Supabase-Edge-Runtime laesst keine Importe von
// fremden Adressen zu (weder statisch noch dynamisch), die Module
// muessen also mit der Funktion hochgeladen werden.
//
// Damit beide Fassungen nicht auseinanderlaufen, vergleicht
// pruefungen.mjs sie auf gleiches Verhalten.

import { ZEITZONE } from "./konfig.js";

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

export const WOCHENTAGE_KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
export const WOCHENTAGE_LANG = [
  "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag",
];

export function teile(zeitpunkt) {
  return teileInZone(ZEITZONE, zeitpunkt, TEILE_FORMAT);
}

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

function versatzMinuten(zone, zeitpunkt) {
  const t = teileInZone(zone, zeitpunkt);
  const alsWaereEsUtc = Date.UTC(t.jahr, t.monat - 1, t.tag, t.stunde, t.minute, t.sekunde);
  return (alsWaereEsUtc - Math.floor(zeitpunkt.getTime() / 1000) * 1000) / 60000;
}

export function vonWanduhrInZone(zone, jahr, monat, tag, stunde = 0, minute = 0) {
  const grob = Date.UTC(jahr, monat - 1, tag, stunde, minute);
  const ersterVersuch = new Date(grob - versatzMinuten(zone, new Date(grob)) * 60000);
  return new Date(grob - versatzMinuten(zone, ersterVersuch) * 60000);
}

export function vonWanduhr(jahr, monat, tag, stunde = 0, minute = 0) {
  return vonWanduhrInZone(ZEITZONE, jahr, monat, tag, stunde, minute);
}

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

export function tagPlus(schluessel, tage) {
  const { jahr, monat, tag } = schluesselTeile(schluessel);
  return new Date(Date.UTC(jahr, monat - 1, tag + tage)).toISOString().slice(0, 10);
}

export function tageDazwischen(vonSchluessel, bisSchluessel) {
  const a = schluesselTeile(vonSchluessel);
  const b = schluesselTeile(bisSchluessel);
  return Math.round(
    (Date.UTC(b.jahr, b.monat - 1, b.tag) - Date.UTC(a.jahr, a.monat - 1, a.tag)) / 86400000,
  );
}

export function wochentag(schluessel) {
  const { jahr, monat, tag } = schluesselTeile(schluessel);
  return (new Date(Date.UTC(jahr, monat - 1, tag)).getUTCDay() + 6) % 7;
}

export function heuteSchluessel() {
  return schluesselVon(new Date());
}

export function tagesBeginn(schluessel, stunde = 0, minute = 0) {
  const { jahr, monat, tag } = schluesselTeile(schluessel);
  return vonWanduhr(jahr, monat, tag, stunde, minute);
}

export function wochenAnfang(schluessel) {
  return tagPlus(schluessel, -wochentag(schluessel));
}

export function uhrzeit(zeitpunkt) {
  return UHRZEIT_FORMAT.format(zeitpunkt);
}

export function minutenImTag(zeitpunkt) {
  const t = teile(zeitpunkt);
  return t.stunde * 60 + t.minute;
}
