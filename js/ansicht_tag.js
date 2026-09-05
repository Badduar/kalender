// Tagesansicht: dasselbe Zeitraster wie die Woche, nur mit einer Spalte.

import { zeichneZeitraster } from "./ansicht_woche.js";

export function zeichneTag(ziel, vorkommenListe, ankerSchluessel, kontext) {
  zeichneZeitraster(ziel, vorkommenListe, [ankerSchluessel], kontext);
}
