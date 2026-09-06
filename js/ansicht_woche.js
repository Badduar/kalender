// Zeitraster fuer Woche und Tag. Beide Ansichten sind derselbe Aufbau,
// nur mit sieben statt einer Spalte.

import {
  wochenRaster, heuteSchluessel, schluesselTeile, schluesselVon,
  minutenImTag, wochentag, WOCHENTAGE_KURZ, WOCHENTAGE_LANG,
} from "./zeit.js";
import { nachTagen } from "./daten.js";
import { plaettchen, block, ueberlappungen } from "./darstellung.js";

const MINUTEN_PRO_TAG = 1440;
const RASTER_MINUTEN = 15;   // Einrasten beim Klick auf freie Flaeche

export function zeichneZeitraster(ziel, vorkommenListe, tage, kontext) {
  const proTag = nachTagen(vorkommenListe, tage);
  const heute = heuteSchluessel();
  const spalten = `3.2rem repeat(${tage.length}, minmax(0, 1fr))`;

  ziel.replaceChildren();
  const wurzel = document.createElement("div");
  wurzel.className = "zeitraster";

  // ---- Kopfzeile mit den Tagen ----
  const kopf = document.createElement("div");
  kopf.className = "zeitraster__kopf";
  kopf.style.gridTemplateColumns = spalten;
  kopf.append(document.createElement("div"));

  for (const schluessel of tage) {
    const { tag } = schluesselTeile(schluessel);
    const wochentagNummer = wochentag(schluessel);
    const zelle = document.createElement("div");
    zelle.className = "zeitraster__kopftag";
    if (wochentagNummer >= 5) zelle.classList.add("zeitraster__kopftag--wochenende");
    if (schluessel === heute) zelle.classList.add("zeitraster__kopftag--heute");
    zelle.title = WOCHENTAGE_LANG[wochentagNummer];
    zelle.append(
      document.createTextNode(WOCHENTAGE_KURZ[wochentagNummer]),
      Object.assign(document.createElement("b"), { textContent: String(tag) }),
    );
    zelle.addEventListener("click", () => kontext.aufTagWechsel(schluessel));
    kopf.append(zelle);
  }

  // ---- Leiste fuer ganztaegige Termine ----
  const ganztags = document.createElement("div");
  ganztags.className = "zeitraster__ganztags";
  ganztags.style.gridTemplateColumns = spalten;

  const ganztagsBeschriftung = document.createElement("div");
  ganztagsBeschriftung.className = "zeitraster__stunden";
  ganztagsBeschriftung.style.padding = ".3rem .35rem 0 0";
  ganztagsBeschriftung.textContent = "ganzt.";
  ganztags.append(ganztagsBeschriftung);

  for (const schluessel of tage) {
    const zelle = document.createElement("div");
    if (wochentag(schluessel) >= 5) zelle.classList.add("ganztags--wochenende");
    if (schluessel === heute) zelle.classList.add("ganztags--heute");
    zelle.addEventListener("click", () => kontext.aufTagKlick(schluessel, null));
    for (const v of (proTag.get(schluessel) ?? []).filter((x) => x.termin.ganztags)) {
      zelle.append(plaettchen(v, kontext));
    }
    ganztags.append(zelle);
  }

  // ---- Stundenraster ----
  const koerper = document.createElement("div");
  koerper.className = "zeitraster__koerper";
  koerper.style.gridTemplateColumns = spalten;

  const stunden = document.createElement("div");
  stunden.className = "zeitraster__stunden";
  for (let s = 0; s < 24; s++) {
    const zeile = document.createElement("div");
    zeile.textContent = s === 0 ? "" : `${String(s).padStart(2, "0")}:00`;
    stunden.append(zeile);
  }
  koerper.append(stunden);

  for (const schluessel of tage) {
    koerper.append(tagesSpalte(schluessel, proTag.get(schluessel) ?? [], heute, kontext));
  }

  // Tagesleiste und Ganztags-Leiste bleiben zusammen oben stehen,
  // sonst verschwinden die ganztaegigen Termine beim Scrollen.
  const oben = document.createElement("div");
  oben.className = "zeitraster__oben";
  oben.append(kopf, ganztags);

  wurzel.append(oben, koerper);
  ziel.append(wurzel);

  // Beim ersten Zeichnen zum Tagesgeschehen scrollen (ca. 7 Uhr).
  const scrollZiel = koerper.scrollHeight * (7 / 24);
  if (ziel.scrollTop === 0) ziel.scrollTop = Math.max(0, scrollZiel - 40);
}

function tagesSpalte(schluessel, eintraege, heute, kontext) {
  const spalte = document.createElement("div");
  spalte.className = "zeitraster__spalte";
  if (wochentag(schluessel) >= 5) spalte.classList.add("zeitraster__spalte--wochenende");
  if (schluessel === heute) spalte.classList.add("zeitraster__spalte--heute");

  // Klick auf freie Flaeche legt einen Termin zur angeklickten Uhrzeit an.
  spalte.addEventListener("click", (e) => {
    if (e.target !== spalte) return;
    const anteil = e.offsetY / spalte.clientHeight;
    const minuten = Math.max(0, Math.min(MINUTEN_PRO_TAG - RASTER_MINUTEN,
      Math.round(anteil * MINUTEN_PRO_TAG / RASTER_MINUTEN) * RASTER_MINUTEN));
    kontext.aufTagKlick(schluessel, minuten);
  });

  const mitZeit = eintraege.filter((v) => !v.termin.ganztags);
  for (const eintrag of ueberlappungen(mitZeit)) {
    const { v, spalte: nummer, spalten: anzahl } = eintrag;

    // Termine ueber Mitternacht werden am jeweiligen Tag abgeschnitten.
    const beginntHeute = schluesselVon(v.beginn) === schluessel;
    const endetHeute = schluesselVon(new Date(v.ende.getTime() - 1)) === schluessel;
    const vonMinute = beginntHeute ? minutenImTag(v.beginn) : 0;
    const bisMinute = endetHeute ? Math.max(minutenImTag(v.ende), vonMinute + 15) : MINUTEN_PRO_TAG;

    const element = block(v, kontext);
    element.style.top = `${(vonMinute / MINUTEN_PRO_TAG) * 100}%`;
    element.style.height = `${((bisMinute - vonMinute) / MINUTEN_PRO_TAG) * 100}%`;
    element.style.left = `calc(${(nummer / anzahl) * 100}% + 2px)`;
    element.style.width = `calc(${(1 / anzahl) * 100}% - 4px)`;
    spalte.append(element);
  }

  if (schluessel === heute) {
    const jetzt = document.createElement("div");
    jetzt.className = "zeitraster__jetzt";
    jetzt.style.top = `${(minutenImTag(new Date()) / MINUTEN_PRO_TAG) * 100}%`;
    spalte.append(jetzt);
  }
  return spalte;
}

export function zeichneWoche(ziel, vorkommenListe, ankerSchluessel, kontext) {
  zeichneZeitraster(ziel, vorkommenListe, wochenRaster(ankerSchluessel), kontext);
}
