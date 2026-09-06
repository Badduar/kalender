// ============================================================
//  Termin anlegen und bearbeiten
// ============================================================
//  Bedient den Dialog aus kalender.html. Fremde Termine werden
//  schreibgeschuetzt angezeigt - dass sie sich nicht speichern lassen,
//  erzwingt zusaetzlich die Datenbank.
// ============================================================

import {
  terminAnlegen, terminAendern, terminLoeschen,
  vorkommenAendern, vorkommenLoeschen, kategorieAnlegen,
} from "./daten.js";
import { regelSchreiben, regelLesen } from "./serie.js";
import {
  fuerEingabe, ausEingabe, tagesBeginn, tagPlus, schluesselVon,
  tageDazwischen, teile, wochentag, WOCHENTAGE_KURZ,
} from "./zeit.js";
import { FARBPALETTE } from "./konfig.js";

export function dialogAufsetzen(kontext) {
  const dialog = document.getElementById("termin-dialog");
  const form = document.getElementById("termin-form");
  const titelZeile = document.getElementById("dialog-titel");
  const fehler = document.getElementById("dialog-fehler");
  const nurLesen = document.getElementById("dialog-nurlesen");
  const loeschKnopf = document.getElementById("dialog-loeschen");
  const speicherKnopf = document.getElementById("dialog-speichern");
  const sichtbarkeitFeld = document.getElementById("sichtbarkeit");
  const wochentageFeld = document.getElementById("wochentage");
  const wiederholung = document.getElementById("wiederholung");
  const kategorieWahl = form.elements.kategorie;
  const neueKategorie = document.getElementById("neue-kategorie");

  // Merkt sich, was gerade bearbeitet wird.
  let aktuell = null;      // null = neuer Termin
  let schreibbar = true;

  // ---------- Aufbau der wiederkehrenden Bedienelemente ----------

  for (let i = 0; i < 7; i++) {
    const id = `wt-${i}`;
    const eingabe = Object.assign(document.createElement("input"),
      { type: "checkbox", id, value: String(i) });
    eingabe.name = "wochentag";
    const beschriftung = Object.assign(document.createElement("label"),
      { htmlFor: id, textContent: WOCHENTAGE_KURZ[i] });
    wochentageFeld.append(eingabe, beschriftung);
  }

  const farbEingabe = document.getElementById("kategorie-farbe");
  FARBPALETTE.forEach((farbe, i) => {
    const id = `kf-${i}`;
    const eingabe = Object.assign(document.createElement("input"),
      { type: "radio", id, value: farbe, checked: i === 0 });
    eingabe.name = "kategoriefarbe";
    const beschriftung = Object.assign(document.createElement("label"), { htmlFor: id });
    beschriftung.style.background = farbe;
    farbEingabe.append(eingabe, beschriftung);
  });

  // ---------- Hilfsfunktionen ----------

  function zeigeFehler(text) {
    fehler.textContent = text ?? "";
    fehler.hidden = !text;
  }

  function kategorienFuellen(ausgewaehlt) {
    kategorieWahl.replaceChildren();
    kategorieWahl.append(new Option("— ohne, Farbe des Erstellers —", ""));
    for (const k of kontext.kategorien.values()) {
      kategorieWahl.append(new Option(k.name, k.id));
    }
    kategorieWahl.append(new Option("+ Neue Kategorie …", "neu"));
    kategorieWahl.value = ausgewaehlt ?? "";
  }

  function sichtbarkeitFuellen(ausgewaehlteIds) {
    sichtbarkeitFeld.replaceChildren();
    const hinweisZeile = document.getElementById("sichtbarkeit-hinweis");

    // Bei fremden Terminen liefert der Server nur die eigene Freigabe.
    // Eine Hakenliste waere hier geraten statt gewusst - also lieber
    // nur die Aussage, die wirklich belegt ist.
    if (!schreibbar) {
      const ersteller = kontext.profile.get(aktuell?.termin.ersteller_id)?.name;
      const satz = document.createElement("p");
      satz.className = "hinweis";
      satz.style.margin = "0";
      satz.textContent = ersteller
        ? `Du bist für diesen Termin freigeschaltet. Wer ihn sonst noch sieht, bestimmt ${ersteller}.`
        : "Du bist für diesen Termin freigeschaltet.";
      sichtbarkeitFeld.append(satz);
      hinweisZeile.hidden = true;
      return;
    }
    hinweisZeile.hidden = false;

    for (const profil of kontext.profile.values()) {
      const id = `sicht-${profil.id}`;
      const eingabe = Object.assign(document.createElement("input"),
        { type: "checkbox", id, value: profil.id });
      eingabe.checked = ausgewaehlteIds.includes(profil.id);

      // Der Ersteller sieht seinen Termin immer - das laesst sich nicht abwaehlen.
      const istErsteller = profil.id === (aktuell?.termin.ersteller_id ?? kontext.eigenesProfil.id);
      if (istErsteller) { eingabe.checked = true; eingabe.disabled = true; }
      if (!schreibbar) eingabe.disabled = true;

      const punkt = document.createElement("span");
      punkt.className = "punkt";
      punkt.style.background = profil.farbe;

      const beschriftung = document.createElement("label");
      beschriftung.htmlFor = id;
      beschriftung.append(eingabe, punkt, document.createTextNode(profil.name));
      sichtbarkeitFeld.append(beschriftung);
    }
  }

  function gewaehlteSichtbarkeit() {
    return [...sichtbarkeitFeld.querySelectorAll("input:checked")].map((e) => e.value);
  }

  function zeitfelderUmstellen() {
    const ganztags = form.elements.ganztags.checked;
    for (const name of ["beginn", "ende"]) {
      const feld = form.elements[name];
      const alt = feld.value;
      feld.type = ganztags ? "date" : "datetime-local";
      if (alt) feld.value = ganztags ? alt.slice(0, 10) : `${alt.slice(0, 10)}T09:00`;
    }
  }

  function wiederholungUmstellen() {
    const art = form.elements.haeufigkeit.value;
    wiederholung.hidden = art === "KEINE";
    document.getElementById("feld-wochentage").hidden = art !== "WEEKLY";
    document.getElementById("intervall-einheit").textContent = {
      DAILY: "Tage", WEEKLY: "Wochen", MONTHLY: "Monate", YEARLY: "Jahre",
    }[art] ?? "";

    const endeArt = form.elements.ende_art.value;
    document.getElementById("feld-anzahl").hidden = endeArt !== "anzahl";
    document.getElementById("feld-bis").hidden = endeArt !== "datum";
  }

  // ---------- Oeffnen ----------

  function neuerTermin(schluessel, minuten) {
    aktuell = null;
    schreibbar = true;
    titelZeile.textContent = "Neuer Termin";
    nurLesen.hidden = true;
    loeschKnopf.hidden = true;
    speicherKnopf.hidden = false;
    zeigeFehler(null);
    form.reset();

    const startMinute = minuten ?? 9 * 60;
    const beginn = tagesBeginn(schluessel, Math.floor(startMinute / 60), startMinute % 60);
    const ende = new Date(beginn.getTime() + 60 * 60000);

    form.elements.titel.value = "";
    form.elements.ganztags.checked = false;
    zeitfelderUmstellen();
    form.elements.beginn.value = fuerEingabe(beginn);
    form.elements.ende.value = fuerEingabe(ende);
    form.elements.haeufigkeit.value = "KEINE";
    form.elements.intervall.value = 1;
    form.elements.ende_art.value = "nie";
    wiederholungUmstellen();

    kategorienFuellen("");
    neueKategorie.hidden = true;
    setzeSchreibschutz(true);
    // Voreinstellung: alle Profile duerfen den Termin sehen.
    sichtbarkeitFuellen([...kontext.profile.keys()]);

    dialog.showModal();
    form.elements.titel.focus();
  }

  function vorhandenerTermin(v) {
    aktuell = v;
    const t = v.termin;
    schreibbar = t.ersteller_id === kontext.eigenesProfil.id;

    titelZeile.textContent = schreibbar ? "Termin bearbeiten" : "Termin";
    zeigeFehler(null);
    form.reset();

    form.elements.titel.value = t.titel ?? "";
    form.elements.ort.value = t.ort ?? "";
    form.elements.beschreibung.value = t.beschreibung ?? "";
    form.elements.ganztags.checked = Boolean(t.ganztags);
    zeitfelderUmstellen();
    form.elements.beginn.value = fuerEingabe(v.beginn, t.ganztags);
    // Ganztaegig wird exklusiv gespeichert (Mitternacht des Folgetags),
    // angezeigt wird aber der letzte betroffene Tag.
    form.elements.ende.value = t.ganztags
      ? schluesselVon(new Date(v.ende.getTime() - 1))
      : fuerEingabe(v.ende);

    const regel = regelLesen(t.serie_regel);
    form.elements.haeufigkeit.value = regel?.haeufigkeit ?? "KEINE";
    form.elements.intervall.value = regel?.intervall ?? 1;
    for (const feld of wochentageFeld.querySelectorAll("input")) {
      feld.checked = Boolean(regel?.wochentage?.includes(Number(feld.value)));
    }
    if (regel?.anzahl) {
      form.elements.ende_art.value = "anzahl";
      form.elements.anzahl.value = regel.anzahl;
    } else if (regel?.bis) {
      form.elements.ende_art.value = "datum";
      form.elements.bis.value = regel.bis;
    } else {
      form.elements.ende_art.value = "nie";
    }
    wiederholungUmstellen();

    kategorienFuellen(t.kategorie_id ?? "");
    neueKategorie.hidden = true;

    if (schreibbar) {
      nurLesen.hidden = true;
      loeschKnopf.hidden = false;
      speicherKnopf.hidden = false;
    } else {
      const ersteller = kontext.profile.get(t.ersteller_id);
      const wem = ersteller?.name ?? "einem anderen Profil";
      nurLesen.textContent = t.verdeckt
        ? `${wem} zeigt von den eigenen Terminen nur Zeit und Farbe. `
          + `Dass dieser Zeitraum belegt ist, siehst du – worum es geht, nicht.`
        : `Dieser Termin gehört ${wem}. Du kannst ihn sehen, aber nicht ändern.`;
      nurLesen.hidden = false;
      loeschKnopf.hidden = true;
      speicherKnopf.hidden = true;
    }
    setzeSchreibschutz(schreibbar);
    sichtbarkeitFuellen(t.sichtbarFuer ?? []);

    dialog.showModal();
  }

  // Sperrt die Eingabefelder bei fremden Terminen. Die Sichtbarkeits-Haken
  // bleiben aussen vor - um die kuemmert sich sichtbarkeitFuellen selbst,
  // weil dort zusaetzlich der Ersteller-Haken gesperrt bleiben muss.
  function setzeSchreibschutz(erlaubt) {
    for (const feld of form.elements) {
      if (feld.type === "button" || feld.type === "submit") continue;
      if (sichtbarkeitFeld.contains(feld)) continue;
      feld.disabled = !erlaubt;
    }
    document.getElementById("kategorie-anlegen").disabled = !erlaubt;
  }

  // ---------- Formular auslesen ----------

  function leseFelder() {
    const ganztags = form.elements.ganztags.checked;
    const titel = form.elements.titel.value.trim();
    if (!titel) throw new Error("Bitte einen Titel angeben.");

    let beginn, ende;
    if (ganztags) {
      const vonTag = form.elements.beginn.value;
      const bisTag = form.elements.ende.value || vonTag;
      if (!vonTag) throw new Error("Bitte ein Datum angeben.");
      if (bisTag < vonTag) throw new Error("Das Ende liegt vor dem Beginn.");
      beginn = tagesBeginn(vonTag);
      // Ende exklusiv: Mitternacht des Folgetags.
      ende = tagesBeginn(tagPlus(bisTag, 1));
    } else {
      beginn = ausEingabe(form.elements.beginn.value);
      ende = ausEingabe(form.elements.ende.value);
      if (!beginn || !ende) throw new Error("Bitte Beginn und Ende angeben.");
      if (ende < beginn) throw new Error("Das Ende liegt vor dem Beginn.");
    }

    let serie_regel = null;
    const art = form.elements.haeufigkeit.value;
    if (art !== "KEINE") {
      const endeArt = form.elements.ende_art.value;
      const wochentage = [...wochentageFeld.querySelectorAll("input:checked")]
        .map((e) => Number(e.value));
      serie_regel = regelSchreiben({
        haeufigkeit: art,
        intervall: Math.max(1, Number(form.elements.intervall.value) || 1),
        wochentage: art === "WEEKLY"
          ? (wochentage.length ? wochentage : [wochentag(schluesselVon(beginn))])
          : [],
        monatstag: null,
        anzahl: endeArt === "anzahl" ? Math.max(1, Number(form.elements.anzahl.value) || 1) : null,
        bis: endeArt === "datum" ? (form.elements.bis.value || null) : null,
      });
      if (endeArt === "datum" && !form.elements.bis.value) {
        throw new Error("Bitte ein Enddatum für die Wiederholung angeben.");
      }
    }

    const kategorie = kategorieWahl.value;
    return {
      titel,
      ort: form.elements.ort.value,
      beschreibung: form.elements.beschreibung.value,
      beginn, ende, ganztags,
      kategorie_id: kategorie === "neu" || kategorie === "" ? null : kategorie,
      serie_regel,
    };
  }

  // Beim Bearbeiten der ganzen Serie darf der Serienanfang nicht auf das
  // gerade geoeffnete Vorkommen springen - sonst faellt alles davor
  // stillschweigend weg. Uhrzeit und Dauer werden uebernommen; das
  // Anfangsdatum wandert nur um so viele Tage, wie der Nutzer dieses
  // eine Vorkommen tatsaechlich verschoben hat (meist null).
  function aufSerienkopfUmrechnen(felder, v) {
    const kopfStart = schluesselVon(new Date(v.termin.beginn));
    const verschiebung = tageDazwischen(v.schluessel, schluesselVon(felder.beginn));
    const neuerStart = tagPlus(kopfStart, verschiebung);

    if (felder.ganztags) {
      const spanne = tageDazwischen(
        schluesselVon(felder.beginn),
        schluesselVon(new Date(felder.ende.getTime() - 1)),
      );
      return {
        ...felder,
        beginn: tagesBeginn(neuerStart),
        ende: tagesBeginn(tagPlus(neuerStart, spanne + 1)),
      };
    }

    const zeit = teile(felder.beginn);
    const dauer = felder.ende.getTime() - felder.beginn.getTime();
    const beginn = tagesBeginn(neuerStart, zeit.stunde, zeit.minute);
    return { ...felder, beginn, ende: new Date(beginn.getTime() + dauer) };
  }

  // ---------- Rueckfrage bei Serien ----------

  const umfangDialog = document.getElementById("umfang-dialog");
  const umfangText = document.getElementById("umfang-text");
  const umfangKnoepfe = [...umfangDialog.querySelectorAll("button[data-umfang]")];

  // Antwort: "einzeln" | "alle" | "" (Abbruch)
  //
  // Bewusst ueber die Knoepfe selbst statt ueber das close-Ereignis eines
  // <form method="dialog">: dieses Ereignis feuert nicht in jeder Umgebung
  // zuverlaessig, und dann haengt der Speichervorgang fuer immer.
  function frageUmfang(text) {
    umfangText.textContent = text;
    return new Promise((fertig) => {
      const beenden = (antwort) => {
        for (const knopf of umfangKnoepfe) knopf.removeEventListener("click", beiKlick);
        umfangDialog.removeEventListener("cancel", beiAbbruch);
        if (umfangDialog.open) umfangDialog.close();
        fertig(antwort);
      };
      const beiKlick = (e) => beenden(e.currentTarget.dataset.umfang);
      const beiAbbruch = () => beenden("");

      for (const knopf of umfangKnoepfe) knopf.addEventListener("click", beiKlick);
      umfangDialog.addEventListener("cancel", beiAbbruch);
      umfangDialog.showModal();
    });
  }

  // ---------- Speichern ----------

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!schreibbar) return;
    zeigeFehler(null);
    speicherKnopf.disabled = true;

    try {
      const felder = leseFelder();
      const sichtbar = gewaehlteSichtbarkeit();

      if (aktuell === null) {
        await terminAnlegen({ ...felder, ersteller_id: kontext.eigenesProfil.id }, sichtbar);
      } else if (aktuell.istSerie) {
        const umfang = await frageUmfang(
          "Dieser Termin gehört zu einer Serie. Was soll geändert werden?",
        );
        if (!umfang) { speicherKnopf.disabled = false; return; }

        if (umfang === "einzeln") {
          await vorkommenAendern(aktuell.termin.id, aktuell.schluessel, felder);
        } else {
          await terminAendern(aktuell.termin.id, aufSerienkopfUmrechnen(felder, aktuell), sichtbar);
        }
      } else {
        await terminAendern(aktuell.termin.id, felder, sichtbar);
      }

      dialog.close();
      await kontext.nachAenderung();
    } catch (ex) {
      zeigeFehler(ex.message ?? "Das Speichern hat nicht geklappt.");
    } finally {
      speicherKnopf.disabled = false;
    }
  });

  // ---------- Loeschen ----------

  loeschKnopf.addEventListener("click", async () => {
    if (!aktuell || !schreibbar) return;
    zeigeFehler(null);
    try {
      if (aktuell.istSerie) {
        const umfang = await frageUmfang(
          "Dieser Termin gehört zu einer Serie. Was soll gelöscht werden?",
        );
        if (!umfang) return;
        if (umfang === "einzeln") {
          await vorkommenLoeschen(aktuell.termin.id, aktuell.schluessel);
        } else {
          await terminLoeschen(aktuell.termin.id);
        }
      } else {
        if (!confirm(`„${aktuell.termin.titel}“ wirklich löschen?`)) return;
        await terminLoeschen(aktuell.termin.id);
      }
      dialog.close();
      await kontext.nachAenderung();
    } catch (ex) {
      zeigeFehler(ex.message ?? "Das Löschen hat nicht geklappt.");
    }
  });

  // ---------- Kleinkram ----------

  form.elements.ganztags.addEventListener("change", zeitfelderUmstellen);
  form.elements.haeufigkeit.addEventListener("change", wiederholungUmstellen);
  form.elements.ende_art.addEventListener("change", wiederholungUmstellen);

  // Ende automatisch mitziehen, solange es hinter dem Beginn liegen soll.
  form.elements.beginn.addEventListener("change", () => {
    if (form.elements.ganztags.checked) return;
    const beginn = ausEingabe(form.elements.beginn.value);
    const ende = ausEingabe(form.elements.ende.value);
    if (beginn && (!ende || ende <= beginn)) {
      form.elements.ende.value = fuerEingabe(new Date(beginn.getTime() + 60 * 60000));
    }
  });

  kategorieWahl.addEventListener("change", () => {
    neueKategorie.hidden = kategorieWahl.value !== "neu";
    if (kategorieWahl.value === "neu") {
      document.getElementById("kategorie-name").focus();
    }
  });

  document.getElementById("kategorie-anlegen").addEventListener("click", async () => {
    const name = document.getElementById("kategorie-name").value.trim();
    const farbe = document.querySelector("input[name=kategoriefarbe]:checked")?.value;
    if (!name) { zeigeFehler("Bitte einen Namen für die Kategorie angeben."); return; }
    try {
      const neu = await kategorieAnlegen(name, farbe, kontext.eigenesProfil.id);
      kontext.kategorien.set(neu.id, neu);
      kategorienFuellen(neu.id);
      neueKategorie.hidden = true;
      document.getElementById("kategorie-name").value = "";
      zeigeFehler(null);
    } catch (ex) {
      zeigeFehler(ex.message ?? "Die Kategorie konnte nicht angelegt werden.");
    }
  });

  document.getElementById("dialog-abbrechen").addEventListener("click", () => dialog.close());
  document.getElementById("dialog-schliessen").addEventListener("click", () => dialog.close());

  return { neuerTermin, vorhandenerTermin };
}
