// ============================================================
//  ICS-Export und -Import
// ============================================================
//  Serien werden als echte RRULE geschrieben, nicht als Einzeltermine.
//  Damit ein woechentlicher 9-Uhr-Termin auch in fremden Kalendern die
//  Zeitumstellung uebersteht, tragen die Zeiten TZID=Europe/Berlin und
//  die Datei bringt den passenden VTIMEZONE-Block mit.
// ============================================================

import { alleTermineLaden } from "./daten.js";
import {
  teile, vonWanduhr, vonWanduhrInZone, zoneBekannt,
  schluesselVon, schluesselTeile, tagPlus, tagesBeginn,
} from "./zeit.js";
import { ZEITZONE } from "./konfig.js";

const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Berlin",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

// ------------------------------------------------------------
//  Export
// ------------------------------------------------------------

function maskieren(text) {
  return String(text ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll(/\r?\n/g, "\\n");
}

// ICS erlaubt maximal 75 Oktett je Zeile; laengere werden umgebrochen
// und mit einem fuehrenden Leerzeichen fortgesetzt.
function falten(zeile) {
  const bytes = new TextEncoder().encode(zeile);
  if (bytes.length <= 75) return zeile;

  const stuecke = [];
  let aktuell = "";
  let laenge = 0;
  for (const zeichen of zeile) {
    const breite = new TextEncoder().encode(zeichen).length;
    if (laenge + breite > (stuecke.length === 0 ? 75 : 74)) {
      stuecke.push(aktuell);
      aktuell = "";
      laenge = 0;
    }
    aktuell += zeichen;
    laenge += breite;
  }
  if (aktuell) stuecke.push(aktuell);
  return stuecke.map((s, i) => (i === 0 ? s : ` ${s}`)).join("\r\n");
}

function zweistellig(n) { return String(n).padStart(2, "0"); }

function alsDatum(zeitpunkt) {
  const t = teile(zeitpunkt);
  return `${t.jahr}${zweistellig(t.monat)}${zweistellig(t.tag)}`;
}

function alsOrtszeit(zeitpunkt) {
  const t = teile(zeitpunkt);
  return `${alsDatum(zeitpunkt)}T${zweistellig(t.stunde)}${zweistellig(t.minute)}00`;
}

function alsUtc(zeitpunkt) {
  return `${zeitpunkt.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
}

function eventZeilen(termin, zeilen) {
  const beginn = new Date(termin.beginn);
  const ende = new Date(termin.ende);

  zeilen.push("BEGIN:VEVENT");
  zeilen.push(`UID:${termin.id}@kalender`);
  zeilen.push(`DTSTAMP:${alsUtc(new Date())}`);

  if (termin.ganztags) {
    zeilen.push(`DTSTART;VALUE=DATE:${alsDatum(beginn)}`);
    zeilen.push(`DTEND;VALUE=DATE:${alsDatum(ende)}`);
  } else {
    zeilen.push(`DTSTART;TZID=${ZEITZONE}:${alsOrtszeit(beginn)}`);
    zeilen.push(`DTEND;TZID=${ZEITZONE}:${alsOrtszeit(ende)}`);
  }

  zeilen.push(`SUMMARY:${maskieren(termin.titel)}`);
  if (termin.ort) zeilen.push(`LOCATION:${maskieren(termin.ort)}`);
  if (termin.beschreibung) zeilen.push(`DESCRIPTION:${maskieren(termin.beschreibung)}`);
  if (termin.serie_regel) zeilen.push(`RRULE:${termin.serie_regel}`);

  // Geloeschte Vorkommen einer Serie
  const geloescht = (termin.ausnahmen ?? []).filter((a) => a.geloescht);
  if (geloescht.length) {
    const werte = geloescht.map((a) => {
      const { jahr, monat, tag } = schluesselTeile(a.original_datum);
      if (termin.ganztags) return `${jahr}${zweistellig(monat)}${zweistellig(tag)}`;
      const zeit = teile(beginn);
      return `${jahr}${zweistellig(monat)}${zweistellig(tag)}T` +
             `${zweistellig(zeit.stunde)}${zweistellig(zeit.minute)}00`;
    });
    zeilen.push(termin.ganztags
      ? `EXDATE;VALUE=DATE:${werte.join(",")}`
      : `EXDATE;TZID=${ZEITZONE}:${werte.join(",")}`);
  }
  zeilen.push("END:VEVENT");

  // Verschobene Vorkommen als eigene Eintraege mit RECURRENCE-ID
  for (const a of (termin.ausnahmen ?? []).filter((x) => !x.geloescht && x.beginn)) {
    const { jahr, monat, tag } = schluesselTeile(a.original_datum);
    const zeit = teile(beginn);
    zeilen.push("BEGIN:VEVENT");
    zeilen.push(`UID:${termin.id}@kalender`);
    zeilen.push(`DTSTAMP:${alsUtc(new Date())}`);
    zeilen.push(`RECURRENCE-ID;TZID=${ZEITZONE}:${jahr}${zweistellig(monat)}${zweistellig(tag)}` +
                `T${zweistellig(zeit.stunde)}${zweistellig(zeit.minute)}00`);
    zeilen.push(`DTSTART;TZID=${ZEITZONE}:${alsOrtszeit(new Date(a.beginn))}`);
    zeilen.push(`DTEND;TZID=${ZEITZONE}:${alsOrtszeit(new Date(a.ende ?? a.beginn))}`);
    zeilen.push(`SUMMARY:${maskieren(a.titel ?? termin.titel)}`);
    if (a.ort ?? termin.ort) zeilen.push(`LOCATION:${maskieren(a.ort ?? termin.ort)}`);
    zeilen.push("END:VEVENT");
  }
}

// Baut die Datei aus den Terminen, die der Nutzer sehen darf.
// "nurEigene" schreibt nur die selbst angelegten.
export async function exportieren({ nurEigene = false, eigeneId = null } = {}) {
  // Ueber dieselbe Funktion wie die Anzeige - sonst landeten die Titel
  // verdeckter Termine in der Datei, obwohl der Kalender sie verbirgt.
  let data = await alleTermineLaden();
  if (nurEigene && eigeneId) data = data.filter((t) => t.ersteller_id === eigeneId);

  const zeilen = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kalender//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...VTIMEZONE,
  ];
  for (const termin of data ?? []) eventZeilen(termin, zeilen);
  zeilen.push("END:VCALENDAR");

  return zeilen.map(falten).join("\r\n") + "\r\n";
}

export function alsDateiHerunterladen(inhalt, dateiname) {
  const blob = new Blob([inhalt], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const verweis = document.createElement("a");
  verweis.href = url;
  verweis.download = dateiname;
  document.body.append(verweis);
  verweis.click();
  verweis.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ------------------------------------------------------------
//  Import
// ------------------------------------------------------------

function entmaskieren(text) {
  return String(text ?? "")
    .replaceAll("\\n", "\n").replaceAll("\\N", "\n")
    .replaceAll("\\,", ",").replaceAll("\\;", ";")
    .replaceAll("\\\\", "\\");
}

// Fortsetzungszeilen wieder zusammensetzen.
function entfalten(text) {
  const zeilen = [];
  for (const roh of text.split(/\r?\n/)) {
    if (/^[ \t]/.test(roh) && zeilen.length) zeilen[zeilen.length - 1] += roh.slice(1);
    else zeilen.push(roh);
  }
  return zeilen;
}

function zerlegeZeile(zeile) {
  const doppelpunkt = zeile.indexOf(":");
  if (doppelpunkt < 0) return null;
  const kopf = zeile.slice(0, doppelpunkt);
  const wert = zeile.slice(doppelpunkt + 1);
  const [name, ...parameterTeile] = kopf.split(";");
  const parameter = {};
  for (const p of parameterTeile) {
    const [pName, pWert = ""] = p.split("=");
    parameter[pName.toUpperCase()] = pWert.replaceAll('"', "");
  }
  return { name: name.toUpperCase(), parameter, wert };
}

// "20260904T090000", "20260904T070000Z" oder "20260904"
function leseZeitpunkt(wert, parameter) {
  const ziffern = wert.replace(/[^0-9TZ]/g, "");
  const jahr = +ziffern.slice(0, 4);
  const monat = +ziffern.slice(4, 6);
  const tag = +ziffern.slice(6, 8);

  if (parameter.VALUE === "DATE" || !ziffern.includes("T")) {
    return { zeitpunkt: vonWanduhr(jahr, monat, tag), ganztags: true };
  }

  const stunde = +ziffern.slice(9, 11) || 0;
  const minute = +ziffern.slice(11, 13) || 0;
  const sekunde = +ziffern.slice(13, 15) || 0;

  if (ziffern.endsWith("Z")) {
    return { zeitpunkt: new Date(Date.UTC(jahr, monat - 1, tag, stunde, minute, sekunde)), ganztags: false };
  }
  // Mit TZID in deren Zone lesen, ohne TZID als Ortszeit behandeln.
  const zone = zoneBekannt(parameter.TZID) ? parameter.TZID : ZEITZONE;
  return { zeitpunkt: vonWanduhrInZone(zone, jahr, monat, tag, stunde, minute), ganztags: false };
}

// Liest die VEVENT-Bloecke einer Datei.
// Eintraege mit RECURRENCE-ID werden uebersprungen: sie gehoeren zu einer
// Serie, deren Ausnahmen wir beim Import nicht uebernehmen.
export function lesen(text) {
  const termine = [];
  let aktuell = null;

  for (const zeile of entfalten(text)) {
    if (zeile === "BEGIN:VEVENT") { aktuell = { ausnahmeVon: null }; continue; }
    if (zeile === "END:VEVENT") {
      if (aktuell && aktuell.titel && aktuell.beginn && !aktuell.ausnahmeVon) {
        // Fehlt DTEND, gilt: ganztaegig = ein Tag, sonst eine Stunde.
        if (!aktuell.ende || aktuell.ende < aktuell.beginn) {
          aktuell.ende = aktuell.ganztags
            ? tagesBeginn(tagPlus(schluesselVon(aktuell.beginn), 1))
            : new Date(aktuell.beginn.getTime() + 3600000);
        }
        termine.push(aktuell);
      }
      aktuell = null;
      continue;
    }
    if (!aktuell) continue;

    const stueck = zerlegeZeile(zeile);
    if (!stueck) continue;

    switch (stueck.name) {
      case "SUMMARY": aktuell.titel = entmaskieren(stueck.wert).slice(0, 200); break;
      case "LOCATION": aktuell.ort = entmaskieren(stueck.wert).slice(0, 200); break;
      case "DESCRIPTION": aktuell.beschreibung = entmaskieren(stueck.wert).slice(0, 5000); break;
      case "RECURRENCE-ID": aktuell.ausnahmeVon = stueck.wert; break;
      case "RRULE": aktuell.serie_regel = stueck.wert.trim().slice(0, 500); break;
      case "DTSTART": {
        const g = leseZeitpunkt(stueck.wert, stueck.parameter);
        aktuell.beginn = g.zeitpunkt;
        aktuell.ganztags = g.ganztags;
        break;
      }
      case "DTEND": {
        const g = leseZeitpunkt(stueck.wert, stueck.parameter);
        aktuell.ende = g.zeitpunkt;
        break;
      }
    }
  }
  return termine;
}
