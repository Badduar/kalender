// ============================================================
//  Übersicht: die Termine eines Tages als schlichte Liste
// ============================================================
//  Kein Raster, keine Stunden - nur untereinander, was ansteht.
//  Gut zum schnellen Nachsehen und auf schmalen Bildschirmen.
// ============================================================

import { nachTagen } from "./daten.js";
import { uhrzeit, datumLang, heuteSchluessel, schluesselVon } from "./zeit.js";
import { farbeFuer, istEigener } from "./darstellung.js";
import { feiertagAn, ferienAn, zeigeFeiertage, zeigeFerien } from "./feiertage.js";

export function zeichneUebersicht(ziel, vorkommenListe, schluessel, kontext) {
  const proTag = nachTagen(vorkommenListe, [schluessel]);
  const eintraege = proTag.get(schluessel) ?? [];

  ziel.replaceChildren();
  const wurzel = document.createElement("div");
  wurzel.className = "uebersicht";

  // ---- Kopf: Datum, Feiertag, Ferien ----
  const kopf = document.createElement("div");
  kopf.className = "uebersicht__kopf";

  const datum = document.createElement("h2");
  datum.className = "uebersicht__datum";
  datum.textContent = datumLang(schluessel);
  if (schluessel === heuteSchluessel()) {
    datum.append(Object.assign(document.createElement("span"), {
      className: "uebersicht__heute", textContent: "heute",
    }));
  }
  kopf.append(datum);

  const anlaesse = [];
  if (zeigeFeiertage()) {
    const f = feiertagAn(schluessel);
    if (f) anlaesse.push({ text: f, art: "feiertag" });
  }
  if (zeigeFerien()) {
    const f = ferienAn(schluessel);
    if (f) anlaesse.push({ text: f.name, art: "ferien" });
  }
  for (const a of anlaesse) {
    kopf.append(Object.assign(document.createElement("span"), {
      className: `uebersicht__anlass uebersicht__anlass--${a.art}`,
      textContent: a.text,
    }));
  }
  wurzel.append(kopf);

  // ---- Liste ----
  if (!eintraege.length) {
    wurzel.append(Object.assign(document.createElement("p"), {
      className: "lade-hinweis",
      textContent: "An diesem Tag steht nichts an.",
    }));
    ziel.append(wurzel);
    return;
  }

  const liste = document.createElement("ul");
  liste.className = "uebersicht__liste";

  for (const v of eintraege) {
    liste.append(zeile(v, schluessel, kontext));
  }

  wurzel.append(liste);
  ziel.append(wurzel);
}

// Ein Listeneintrag. Bewusst als Knopf, damit er sich mit der Tastatur
// erreichen laesst - anders als die Plaettchen im Raster steht hier
// jeder Termin fuer sich.
export function zeile(v, schluessel, kontext) {
  const t = v.termin;
  const punkt = document.createElement("li");

  const knopf = document.createElement("button");
  knopf.type = "button";
  knopf.className = "eintrag";
  knopf.style.setProperty("--farbe", farbeFuer(t, kontext));
  if (t.verdeckt) knopf.classList.add("eintrag--verdeckt");

  // Zeitspalte
  const zeit = document.createElement("span");
  zeit.className = "eintrag__zeit";
  if (t.ganztags) {
    zeit.textContent = "ganztägig";
    zeit.classList.add("eintrag__zeit--ganztags");
  } else {
    // Laeuft der Termin ueber mehrere Tage, zeigt der Tag nur seinen Anteil.
    const beginntHeute = schluesselVon(v.beginn) === schluessel;
    const endetHeute = schluesselVon(new Date(v.ende.getTime() - 1)) === schluessel;
    zeit.append(
      Object.assign(document.createElement("b"), {
        textContent: beginntHeute ? uhrzeit(v.beginn) : "…",
      }),
      Object.assign(document.createElement("small"), {
        textContent: endetHeute ? uhrzeit(v.ende) : "…",
      }),
    );
  }

  // Inhalt
  const inhalt = document.createElement("span");
  inhalt.className = "eintrag__inhalt";
  inhalt.append(Object.assign(document.createElement("b"), { textContent: t.titel }));

  const beiwerk = [];
  if (t.ort) beiwerk.push(t.ort);
  const ersteller = kontext.profile.get(t.ersteller_id);
  if (ersteller && !istEigener(t, kontext)) beiwerk.push(`von ${ersteller.name}`);
  if (t.erinnerung_minuten) {
    beiwerk.push(t.erinnerung_minuten < 60
      ? `Erinnerung ${t.erinnerung_minuten} Min vorher`
      : `Erinnerung ${t.erinnerung_minuten / 60} Std vorher`);
  }
  if (beiwerk.length) {
    inhalt.append(Object.assign(document.createElement("small"), {
      textContent: beiwerk.join(" · "),
    }));
  }
  if (t.beschreibung) {
    inhalt.append(Object.assign(document.createElement("p"), {
      className: "eintrag__notiz", textContent: t.beschreibung,
    }));
  }

  knopf.append(zeit, inhalt);
  knopf.addEventListener("click", () => kontext.aufTerminKlick(v));
  punkt.append(knopf);
  return punkt;
}
