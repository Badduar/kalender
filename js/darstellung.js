// Gemeinsame Bausteine der drei Ansichten: Farbe und Termin-Plaettchen.

import { uhrzeit } from "./zeit.js";
import { STANDARD_FARBE } from "./konfig.js";

// Die Kategorie bestimmt die Farbe. Ohne Kategorie faellt der Termin
// auf die Farbe seines Erstellers zurueck - so sieht man auf einen Blick,
// von wem er stammt.
export function farbeFuer(termin, kontext) {
  if (termin.kategorie_id) {
    const kategorie = kontext.kategorien.get(termin.kategorie_id);
    if (kategorie) return kategorie.farbe;
  }
  return kontext.profile.get(termin.ersteller_id)?.farbe ?? STANDARD_FARBE;
}

export function istEigener(termin, kontext) {
  return termin.ersteller_id === kontext.eigenesProfil.id;
}

// Kurzbeschreibung fuer Titel-Tooltip und Vorlesehilfen.
export function beschriftung(v, kontext) {
  const t = v.termin;
  const teile = [t.titel];
  teile.push(t.ganztags ? "ganztägig" : `${uhrzeit(v.beginn)}–${uhrzeit(v.ende)}`);
  // Bei verdeckten Terminen gibt es weder Ort noch Notiz - der Server
  // liefert sie gar nicht erst mit.
  if (t.ort) teile.push(t.ort);
  const ersteller = kontext.profile.get(t.ersteller_id);
  if (ersteller && !istEigener(t, kontext)) teile.push(`von ${ersteller.name}`);
  return teile.join(" · ");
}

// Flaches Plaettchen fuer Monatsansicht und Ganztags-Leiste.
export function plaettchen(v, kontext) {
  const t = v.termin;
  const knopf = document.createElement("button");
  knopf.type = "button";
  knopf.className = "termin";
  if (t.ganztags) knopf.classList.add("termin--ganztags");
  if (!istEigener(t, kontext)) knopf.classList.add("termin--fremd");
  if (t.verdeckt) knopf.classList.add("termin--verdeckt");
  knopf.style.setProperty("--farbe", farbeFuer(t, kontext));
  knopf.title = beschriftung(v, kontext);

  if (!t.ganztags) {
    const zeit = document.createElement("span");
    zeit.className = "termin__zeit";
    zeit.textContent = uhrzeit(v.beginn);
    knopf.append(zeit);
  }
  const titel = document.createElement("span");
  titel.className = "termin__titel";
  titel.textContent = t.titel;
  knopf.append(titel);

  knopf.addEventListener("click", (e) => {
    e.stopPropagation();
    kontext.aufTerminKlick(v);
  });
  return knopf;
}

// Block mit Hoehe und Position fuer das Zeitraster.
export function block(v, kontext) {
  const t = v.termin;
  const knopf = document.createElement("button");
  knopf.type = "button";
  knopf.className = "block";
  if (!istEigener(t, kontext)) knopf.classList.add("block--fremd");
  if (t.verdeckt) knopf.classList.add("block--verdeckt");
  knopf.style.setProperty("--farbe", farbeFuer(t, kontext));
  knopf.title = beschriftung(v, kontext);

  const titel = document.createElement("b");
  titel.textContent = t.titel;
  const zeit = document.createElement("small");
  zeit.textContent = `${uhrzeit(v.beginn)}–${uhrzeit(v.ende)}`;
  knopf.append(titel, zeit);

  knopf.addEventListener("click", (e) => {
    e.stopPropagation();
    kontext.aufTerminKlick(v);
  });
  return knopf;
}

// Legt ueberlappende Termine nebeneinander.
// Liefert je Vorkommen { v, spalte, spalten }.
export function ueberlappungen(liste) {
  const sortiert = [...liste].sort((a, b) => a.beginn - b.beginn || b.ende - a.ende);
  const ergebnis = [];
  let gruppe = [];
  let gruppenEnde = -Infinity;

  const gruppeAbschliessen = () => {
    if (!gruppe.length) return;
    // Spalten innerhalb der Gruppe vergeben: die erste freie nehmen.
    const spaltenEnde = [];
    for (const eintrag of gruppe) {
      let spalte = spaltenEnde.findIndex((ende) => ende <= eintrag.v.beginn.getTime());
      if (spalte === -1) { spalte = spaltenEnde.length; spaltenEnde.push(0); }
      spaltenEnde[spalte] = eintrag.v.ende.getTime();
      eintrag.spalte = spalte;
    }
    for (const eintrag of gruppe) eintrag.spalten = spaltenEnde.length;
    gruppe = [];
  };

  for (const v of sortiert) {
    if (v.beginn.getTime() >= gruppenEnde) {
      gruppeAbschliessen();
      gruppenEnde = -Infinity;
    }
    const eintrag = { v, spalte: 0, spalten: 1 };
    gruppe.push(eintrag);
    ergebnis.push(eintrag);
    gruppenEnde = Math.max(gruppenEnde, v.ende.getTime());
  }
  gruppeAbschliessen();
  return ergebnis;
}
