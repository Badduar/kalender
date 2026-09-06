// Auszug aus ../../../js/serie.js - nur das, was der Versand braucht
// (regelSchreiben, regelText und serienEnde bleiben aussen vor).
//
// Warum eine Kopie? Siehe zeit.js daneben.
// pruefungen.mjs vergleicht beide Fassungen auf gleiches Verhalten.

import {
  schluesselVon, schluesselTeile, schluesselAus, tagPlus, tageDazwischen,
  wochentag, wochenAnfang, teile, vonWanduhr, WOCHENTAGE_LANG,
} from "./zeit.js";

// Reihenfolge wie in RRULE: MO=0 ... SU=6
export const BYDAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

// Notbremse gegen Endlosschleifen bei kaputten Regeln.
const MAX_VORKOMMEN = 10000;

// ------------------------------------------------------------
//  Regel lesen und schreiben
// ------------------------------------------------------------

export function regelLesen(text) {
  if (!text) return null;
  const regel = {
    haeufigkeit: "WEEKLY",
    intervall: 1,
    wochentage: [],
    monatstag: null,
    anzahl: null,
    bis: null,
  };
  for (const teilStueck of String(text).split(";")) {
    const [name, wert = ""] = teilStueck.split("=");
    switch (name.trim().toUpperCase()) {
      case "FREQ":
        regel.haeufigkeit = wert.trim().toUpperCase();
        break;
      case "INTERVAL":
        regel.intervall = Math.max(1, parseInt(wert, 10) || 1);
        break;
      case "BYDAY":
        regel.wochentage = wert.split(",")
          .map((c) => BYDAY_CODES.indexOf(c.trim().toUpperCase()))
          .filter((i) => i >= 0)
          .sort((a, b) => a - b);
        break;
      case "BYMONTHDAY":
        regel.monatstag = parseInt(wert, 10) || null;
        break;
      case "COUNT":
        regel.anzahl = Math.max(1, parseInt(wert, 10) || 1);
        break;
      case "UNTIL": {
        // Akzeptiert "20261231" und "2026-12-31"
        const ziffern = wert.replace(/[^0-9]/g, "").slice(0, 8);
        if (ziffern.length === 8) {
          regel.bis = `${ziffern.slice(0, 4)}-${ziffern.slice(4, 6)}-${ziffern.slice(6, 8)}`;
        }
        break;
      }
    }
  }
  return regel;
}

export function serienTage(startSchluessel, regelText, vonSchluessel, bisSchluessel) {
  const regel = regelLesen(regelText);
  if (!regel) return [];

  const grenze = regel.bis && regel.bis < bisSchluessel ? regel.bis : bisSchluessel;
  const treffer = [];
  let gezaehlt = 0;

  const aufnehmen = (schluessel) => {
    if (regel.anzahl && gezaehlt >= regel.anzahl) return false;
    if (schluessel > grenze) return false;
    gezaehlt += 1;
    if (schluessel >= vonSchluessel) treffer.push(schluessel);
    return true;
  };

  if (regel.haeufigkeit === "WEEKLY") {
    const tage = regel.wochentage.length
      ? regel.wochentage
      : [wochentag(startSchluessel)];
    let wochenStart = wochenAnfang(startSchluessel);

    for (let runde = 0; runde < MAX_VORKOMMEN; runde++) {
      if (wochenStart > grenze) break;
      let weiter = true;
      for (const tagNummer of tage) {
        const schluessel = tagPlus(wochenStart, tagNummer);
        if (schluessel < startSchluessel) continue;
        if (!aufnehmen(schluessel)) { weiter = false; break; }
      }
      if (!weiter) break;
      if (regel.anzahl && gezaehlt >= regel.anzahl) break;
      wochenStart = tagPlus(wochenStart, 7 * regel.intervall);
    }
    return treffer;
  }

  if (regel.haeufigkeit === "DAILY") {
    let schluessel = startSchluessel;
    for (let runde = 0; runde < MAX_VORKOMMEN; runde++) {
      if (!aufnehmen(schluessel)) break;
      schluessel = tagPlus(schluessel, regel.intervall);
    }
    return treffer;
  }

  if (regel.haeufigkeit === "MONTHLY" || regel.haeufigkeit === "YEARLY") {
    const start = schluesselTeile(startSchluessel);
    const zielTag = regel.haeufigkeit === "MONTHLY"
      ? (regel.monatstag || start.tag)
      : start.tag;
    const schrittMonate = regel.haeufigkeit === "MONTHLY" ? regel.intervall : 12 * regel.intervall;

    for (let runde = 0; runde < MAX_VORKOMMEN; runde++) {
      const zeiger = new Date(Date.UTC(start.jahr, start.monat - 1 + runde * schrittMonate, 1));
      const jahr = zeiger.getUTCFullYear();
      const monat = zeiger.getUTCMonth() + 1;
      const tageImMonat = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();

      // Monate ohne diesen Tag (z.B. 31. Februar) fallen aus - so sieht
      // es der RRULE-Standard vor.
      if (zielTag > tageImMonat) {
        if (schluesselAus(jahr, monat, 1) > grenze) break;
        continue;
      }
      const schluessel = schluesselAus(jahr, monat, zielTag);
      if (schluessel < startSchluessel) continue;
      if (!aufnehmen(schluessel)) break;
    }
    return treffer;
  }

  return treffer;
}

// ------------------------------------------------------------
//  Aus einem Termin die sichtbaren Vorkommen machen
// ------------------------------------------------------------
//  Ergebnis je Vorkommen:
//    { termin, schluessel, beginn, ende, istSerie, verschoben }
//  "schluessel" ist immer das urspruengliche Datum laut Regel - damit
//  laesst sich die passende Ausnahme finden, auch wenn das Vorkommen
//  verschoben wurde.

export function vorkommen(termin, vonSchluessel, bisSchluessel) {
  const beginn = new Date(termin.beginn);
  const ende = new Date(termin.ende);
  const startSchluessel = schluesselVon(beginn);

  if (!termin.serie_regel) {
    const endSchluessel = schluesselVon(ende);
    if (endSchluessel < vonSchluessel || startSchluessel > bisSchluessel) return [];
    return [{
      termin, schluessel: startSchluessel, beginn, ende,
      istSerie: false, verschoben: false,
    }];
  }

  const zeit = teile(beginn);
  const dauerMs = ende.getTime() - beginn.getTime();
  const spanneTage = tageDazwischen(startSchluessel, schluesselVon(ende));

  // Etwas Vorlauf, damit mehrtaegige Vorkommen, die vor dem Fenster
  // beginnen, aber hineinragen, nicht verlorengehen.
  const suchVon = tagPlus(vonSchluessel, -Math.max(spanneTage, 0) - 1);

  const ausnahmen = new Map(
    (termin.ausnahmen ?? []).map((a) => [a.original_datum, a]),
  );

  const ergebnis = [];
  for (const schluessel of serienTage(startSchluessel, termin.serie_regel, suchVon, bisSchluessel)) {
    const ausnahme = ausnahmen.get(schluessel);
    if (ausnahme?.geloescht) continue;

    const { jahr, monat, tag } = schluesselTeile(schluessel);
    let vorkommenBeginn = ausnahme?.beginn
      ? new Date(ausnahme.beginn)
      : vonWanduhr(jahr, monat, tag, zeit.stunde, zeit.minute);

    let vorkommenEnde;
    if (ausnahme?.ende) {
      vorkommenEnde = new Date(ausnahme.ende);
    } else if (termin.ganztags) {
      // Ganztaegig ueber Tage rechnen, nicht ueber Millisekunden -
      // sonst rutscht der Termin an Umstellungstagen um eine Stunde.
      const endSchluessel = tagPlus(schluessel, spanneTage);
      const e = schluesselTeile(endSchluessel);
      vorkommenEnde = vonWanduhr(e.jahr, e.monat, e.tag, 0, 0);
    } else {
      vorkommenEnde = new Date(vorkommenBeginn.getTime() + dauerMs);
    }

    // Fenster erneut pruefen, weil eine Ausnahme verschoben sein kann.
    if (schluesselVon(vorkommenEnde) < vonSchluessel) continue;
    if (schluesselVon(vorkommenBeginn) > bisSchluessel) continue;

    ergebnis.push({
      termin: ausnahme
        ? {
            ...termin,
            titel: ausnahme.titel ?? termin.titel,
            ort: ausnahme.ort ?? termin.ort,
            beschreibung: ausnahme.beschreibung ?? termin.beschreibung,
          }
        : termin,
      schluessel,
      beginn: vorkommenBeginn,
      ende: vorkommenEnde,
      istSerie: true,
      verschoben: Boolean(ausnahme && !ausnahme.geloescht),
    });
  }
  return ergebnis;
}
