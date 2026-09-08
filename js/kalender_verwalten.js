// ============================================================
//  Eigene Kalender anlegen, umbenennen, entfernen
// ============================================================
//  Ein Konto kann mehrere Kalender haben - etwa "Privat" und
//  "Dienst" - und im Betrieb zwischen ihnen umschalten. An der
//  Sichtbarkeit aendert das nichts: freigegebene Termine sehen
//  weiterhin alle Freigeschalteten.
// ============================================================

import { kalenderAnlegen, kalenderAendern, kalenderLoeschen } from "./daten.js";
import { FARBPALETTE } from "./konfig.js";

export function verwaltungAufsetzen(kontext) {
  const dialog = document.getElementById("kalender-dialog");
  const liste = document.getElementById("kalenderliste");
  const fehler = document.getElementById("kalender-fehler");
  const nameFeld = document.getElementById("kalender-name");
  const farbFeld = document.getElementById("kalender-farbe");
  const anlegenKnopf = document.getElementById("kalender-neu");

  document.getElementById("kalender-schliessen")
    .addEventListener("click", () => dialog.close());

  // Farbauswahl fuer den neuen Kalender
  FARBPALETTE.forEach((farbe, i) => {
    const id = `kalf-${i}`;
    const eingabe = Object.assign(document.createElement("input"),
      { type: "radio", id, value: farbe, checked: i === 0 });
    eingabe.name = "kalenderfarbe";
    const beschriftung = Object.assign(document.createElement("label"), { htmlFor: id });
    beschriftung.style.background = farbe;
    farbFeld.append(eingabe, beschriftung);
  });

  function zeigeFehler(text) {
    fehler.textContent = text ?? "";
    fehler.hidden = !text;
  }

  function eigene() {
    return [...kontext.kalender.values()]
      .filter((k) => k.besitzer_id === kontext.eigenesProfil.id);
  }

  function listeZeichnen() {
    liste.replaceChildren();
    const meine = eigene();

    for (const k of meine) {
      const zeile = document.createElement("div");
      zeile.className = "kalenderzeile";

      const name = Object.assign(document.createElement("input"), {
        type: "text", value: k.name, maxLength: 40,
      });
      name.className = "kalenderzeile__name";

      const farbe = document.createElement("div");
      farbe.className = "farbwahl farbwahl--klein";
      FARBPALETTE.forEach((f, i) => {
        const id = `kf-${k.id}-${i}`;
        const eingabe = Object.assign(document.createElement("input"),
          { type: "radio", id, value: f, checked: f.toLowerCase() === k.farbe.toLowerCase() });
        eingabe.name = `farbe-${k.id}`;
        const beschriftung = Object.assign(document.createElement("label"), { htmlFor: id });
        beschriftung.style.background = f;
        farbe.append(eingabe, beschriftung);
      });
      // Eine Farbe ausserhalb der Palette (etwa aus der Profilfarbe
      // uebernommen) waere sonst nicht angewaehlt und ginge beim
      // Speichern verloren - deshalb als zusaetzlicher Punkt.
      if (!FARBPALETTE.some((f) => f.toLowerCase() === k.farbe.toLowerCase())) {
        const id = `kf-${k.id}-eigen`;
        const eingabe = Object.assign(document.createElement("input"),
          { type: "radio", id, value: k.farbe, checked: true });
        eingabe.name = `farbe-${k.id}`;
        const beschriftung = Object.assign(document.createElement("label"), { htmlFor: id });
        beschriftung.style.background = k.farbe;
        beschriftung.title = "bisherige Farbe";
        farbe.append(eingabe, beschriftung);
      }

      const sichern = Object.assign(document.createElement("button"), {
        type: "button", className: "knopf", textContent: "Speichern",
      });
      sichern.addEventListener("click", async () => {
        zeigeFehler(null);
        const gewaehlt = farbe.querySelector("input:checked")?.value ?? k.farbe;
        if (!name.value.trim()) { zeigeFehler("Der Name darf nicht leer sein."); return; }
        sichern.disabled = true;
        try {
          await kalenderAendern(k.id, name.value, gewaehlt);
          await kontext.kalenderNeuLaden();
          listeZeichnen();
        } catch (ex) {
          zeigeFehler(ex.message ?? String(ex));
        } finally {
          sichern.disabled = false;
        }
      });

      const weg = Object.assign(document.createElement("button"), {
        type: "button", className: "knopf knopf--gefahr", textContent: "Entfernen",
      });
      // Der letzte Kalender bleibt: ohne ihn koennte man nichts anlegen.
      weg.disabled = meine.length < 2;
      if (weg.disabled) weg.title = "Der letzte Kalender lässt sich nicht entfernen.";
      weg.addEventListener("click", async () => {
        zeigeFehler(null);
        if (!confirm(`Kalender „${k.name}“ entfernen?`)) return;
        weg.disabled = true;
        try {
          await kalenderLoeschen(k.id);
          await kontext.kalenderNeuLaden();
          listeZeichnen();
        } catch (ex) {
          zeigeFehler(ex.message ?? String(ex));
          weg.disabled = false;
        }
      });

      zeile.append(name, farbe, sichern, weg);
      liste.append(zeile);
    }
  }

  anlegenKnopf.addEventListener("click", async () => {
    zeigeFehler(null);
    const name = nameFeld.value.trim();
    if (!name) { zeigeFehler("Bitte einen Namen angeben."); return; }
    const farbe = farbFeld.querySelector("input:checked")?.value ?? FARBPALETTE[0];

    anlegenKnopf.disabled = true;
    try {
      const neu = await kalenderAnlegen(name, farbe, kontext.eigenesProfil.id);
      await kontext.kalenderNeuLaden();
      nameFeld.value = "";
      listeZeichnen();
      // Gleich hineinwechseln - man legt ihn ja an, um ihn zu benutzen.
      kontext.kalenderWechseln(neu.id);
    } catch (ex) {
      zeigeFehler(ex.message ?? String(ex));
    } finally {
      anlegenKnopf.disabled = false;
    }
  });

  return {
    oeffnen() {
      zeigeFehler(null);
      nameFeld.value = "";
      listeZeichnen();
      dialog.showModal();
    },
  };
}
