// Monatsansicht: sechs Wochen am Stueck, damit die Hoehe beim
// Blaettern nicht springt.

import {
  monatsRaster, heuteSchluessel, schluesselTeile, wochentag,
  WOCHENTAGE_KURZ, WOCHENTAGE_LANG,
} from "./zeit.js";
import { nachTagen } from "./daten.js";
import { plaettchen } from "./darstellung.js";

const MAX_PLAETTCHEN = 3;

export function zeichneMonat(ziel, vorkommenListe, ankerSchluessel, kontext) {
  const tage = monatsRaster(ankerSchluessel);
  const proTag = nachTagen(vorkommenListe, tage);
  const heute = heuteSchluessel();
  const angezeigterMonat = schluesselTeile(ankerSchluessel).monat;

  ziel.replaceChildren();
  const wurzel = document.createElement("div");
  wurzel.className = "monat";

  const kopf = document.createElement("div");
  kopf.className = "monat__wochentage";
  for (let i = 0; i < 7; i++) {
    const feld = document.createElement("span");
    feld.textContent = WOCHENTAGE_KURZ[i];
    feld.title = WOCHENTAGE_LANG[i];
    if (i >= 5) feld.classList.add("ist-wochenende");
    kopf.append(feld);
  }

  const raster = document.createElement("div");
  raster.className = "monat__raster";

  for (const schluessel of tage) {
    const { monat, tag } = schluesselTeile(schluessel);
    const zelle = document.createElement("div");
    zelle.className = "tag";
    // Reihenfolge egal - welcher Hintergrund gewinnt, regelt das
    // Stylesheet ueber die Quelltextreihenfolge (heute schlaegt alles).
    if (wochentag(schluessel) >= 5) zelle.classList.add("tag--wochenende");
    if (monat !== angezeigterMonat) zelle.classList.add("tag--fremd");
    if (schluessel === heute) zelle.classList.add("tag--heute");
    zelle.addEventListener("click", () => kontext.aufTagKlick(schluessel));

    const zahl = document.createElement("span");
    zahl.className = "tag__zahl";
    zahl.textContent = String(tag);
    zelle.append(zahl);

    const eintraege = proTag.get(schluessel) ?? [];
    for (const v of eintraege.slice(0, MAX_PLAETTCHEN)) {
      zelle.append(plaettchen(v, kontext));
    }
    if (eintraege.length > MAX_PLAETTCHEN) {
      const mehr = document.createElement("button");
      mehr.type = "button";
      mehr.className = "knopf knopf--leise tag__mehr";
      mehr.style.padding = "0";
      mehr.textContent = `+ ${eintraege.length - MAX_PLAETTCHEN} weitere`;
      mehr.addEventListener("click", (e) => {
        e.stopPropagation();
        kontext.aufTagWechsel(schluessel);
      });
      zelle.append(mehr);
    }
    raster.append(zelle);
  }

  wurzel.append(kopf, raster);
  ziel.append(wurzel);
}
