// ============================================================
//  Termine suchen
// ============================================================
//  Durchsucht Titel, Ort und Notiz der Termine, die man vollständig
//  sehen darf.
//
//  Verdeckte Termine ("nur belegt") sind ausgenommen - und zwar nicht
//  nur, weil sie nichts Durchsuchbares enthielten: Es wäre auch ein
//  Leck, wenn man über einen Treffer erschließen könnte, worum es geht.
//  Der Server liefert Titel, Ort und Notiz solcher Termine ohnehin gar
//  nicht erst mit; hier wird zusätzlich ausdrücklich gefiltert.
// ============================================================

import { termineLaden } from "./daten.js";
import { uhrzeit, datumLang, heuteSchluessel, tagPlus, schluesselVon } from "./zeit.js";
import { farbeFuer, istEigener } from "./darstellung.js";

// Wie weit gesucht wird. Unbegrenzt geht nicht: eine tägliche Serie
// ohne Ende hätte unendlich viele Vorkommen.
const JAHRE_ZURUECK = 2;
const JAHRE_VORAUS = 3;

const MINDESTLAENGE = 2;
const MAX_TREFFER = 100;
// Je Serie hoechstens so viele Vorkommen je Richtung (kommend/vergangen).
const PRO_SERIE = 3;

export function sucheAufsetzen(kontext) {
  const dialog = document.getElementById("suche-dialog");
  const feld = document.getElementById("suche-feld");
  const ergebnis = document.getElementById("suche-ergebnis");
  const stand = document.getElementById("suche-stand");
  const schliessen = document.getElementById("suche-schliessen");

  let geladen = null;      // Vorkommen des Suchzeitraums, einmal geholt
  let laeuft = 0;
  let tippUhr = null;

  schliessen.addEventListener("click", () => dialog.close());

  async function vorratHolen() {
    if (geladen) return geladen;
    const heute = heuteSchluessel();
    const von = tagPlus(heute, -365 * JAHRE_ZURUECK);
    const bis = tagPlus(heute, 365 * JAHRE_VORAUS);
    geladen = await termineLaden(von, bis);
    return geladen;
  }

  function passt(v, worte) {
    const t = v.termin;
    if (t.verdeckt) return false;      // fremder Termin ohne Inhalt
    const heuhaufen = [t.titel, t.ort, t.beschreibung]
      .filter(Boolean).join(" ").toLowerCase();
    return worte.every((w) => heuhaufen.includes(w));
  }

  async function suchen() {
    const text = feld.value.trim().toLowerCase();
    ergebnis.replaceChildren();

    if (text.length < MINDESTLAENGE) {
      stand.textContent = `Mindestens ${MINDESTLAENGE} Zeichen eingeben.`;
      return;
    }

    const meine = ++laeuft;
    stand.textContent = "Wird gesucht …";

    let vorrat;
    try {
      vorrat = await vorratHolen();
    } catch (ex) {
      if (meine !== laeuft) return;
      stand.textContent = `Die Suche ist fehlgeschlagen: ${ex.message ?? ex}`;
      return;
    }
    if (meine !== laeuft) return;

    // Mehrere Wörter müssen alle vorkommen, Reihenfolge egal.
    const worte = text.split(/\s+/).filter(Boolean);
    const treffer = vorrat.filter((v) => passt(v, worte));

    if (!treffer.length) {
      stand.textContent = "Nichts gefunden.";
      return;
    }

    const heute = heuteSchluessel();
    // Kommende zuerst, danach die vergangenen von neu nach alt -
    // meistens sucht man etwas, das noch bevorsteht.
    const kommend = treffer.filter((v) => schluesselVon(v.beginn) >= heute)
      .sort((a, b) => a.beginn - b.beginn);
    const vergangen = treffer.filter((v) => schluesselVon(v.beginn) < heute)
      .sort((a, b) => b.beginn - a.beginn);

    // Eine woechentliche Serie liefert ueber den Suchzeitraum weit ueber
    // hundert Vorkommen - als Liste unbrauchbar. Deshalb je Serie nur
    // die naechsten und die letzten paar.
    const gekuerzt = [...jeSerieHoechstens(kommend), ...jeSerieHoechstens(vergangen)];
    const sortiert = gekuerzt.slice(0, MAX_TREFFER);
    const ausgelassen = treffer.length - gekuerzt.length;

    stand.textContent = ausgelassen > 0
      ? `${treffer.length} Treffer. Bei Serien werden nur die nächsten und letzten `
        + `${PRO_SERIE} gezeigt, ${ausgelassen} weitere sind ausgelassen.`
      : `${treffer.length} Treffer.`;

    for (const v of sortiert) {
      ergebnis.append(trefferZeile(v, kontext, dialog));
    }
  }

  feld.addEventListener("input", () => {
    clearTimeout(tippUhr);
    tippUhr = setTimeout(suchen, 200);
  });

  function oeffnen() {
    geladen = null;              // beim Öffnen frische Daten holen
    feld.value = "";
    ergebnis.replaceChildren();
    stand.textContent = `Mindestens ${MINDESTLAENGE} Zeichen eingeben.`;
    dialog.showModal();
    feld.focus();
  }

  return { oeffnen };
}

// Behaelt je Termin hoechstens PRO_SERIE Vorkommen, Reihenfolge bleibt.
// Einzeltermine sind davon nicht betroffen, sie kommen nur einmal vor.
function jeSerieHoechstens(liste) {
  const zaehler = new Map();
  return liste.filter((v) => {
    const bisher = zaehler.get(v.termin.id) ?? 0;
    if (bisher >= PRO_SERIE) return false;
    zaehler.set(v.termin.id, bisher + 1);
    return true;
  });
}

function trefferZeile(v, kontext, dialog) {
  const t = v.termin;
  const knopf = document.createElement("button");
  knopf.type = "button";
  knopf.className = "treffer";
  knopf.style.setProperty("--farbe", farbeFuer(t, kontext));

  const wann = document.createElement("span");
  wann.className = "treffer__wann";
  wann.append(
    Object.assign(document.createElement("b"), { textContent: datumLang(schluesselVon(v.beginn)) }),
    Object.assign(document.createElement("small"), {
      textContent: t.ganztags ? "ganztägig" : `${uhrzeit(v.beginn)}–${uhrzeit(v.ende)}`,
    }),
  );

  const was = document.createElement("span");
  was.className = "treffer__was";
  was.append(Object.assign(document.createElement("b"), { textContent: t.titel }));

  const beiwerk = [];
  if (t.ort) beiwerk.push(t.ort);
  const ersteller = kontext.profile.get(t.ersteller_id);
  if (ersteller && !istEigener(t, kontext)) beiwerk.push(`von ${ersteller.name}`);
  if (beiwerk.length) {
    was.append(Object.assign(document.createElement("small"), { textContent: beiwerk.join(" · ") }));
  }

  knopf.append(wann, was);
  knopf.addEventListener("click", () => {
    dialog.close();
    // Zur Übersicht des Tages - dort steht der Treffer im Zusammenhang.
    kontext.aufUebersicht(schluesselVon(v.beginn));
  });
  return knopf;
}
