// ============================================================
//  Anwendung: Zustand, Navigation, Zeichnen
// ============================================================

import { verlangeAnmeldung, abmelden, eigenesProfil } from "./auth.js";
import {
  profileLaden, kategorienLaden, termineLaden, terminAnlegen, aufAenderungenHoeren,
} from "./daten.js";
import {
  heuteSchluessel, schluesselTeile, schluesselAus, tagPlus, monatsRaster,
  wochenRaster, datumLang, datumKurz, MONATE,
} from "./zeit.js";
import { zeichneMonat } from "./ansicht_monat.js";
import { zeichneWoche } from "./ansicht_woche.js";
import { zeichneTag } from "./ansicht_tag.js";
import { dialogAufsetzen } from "./termin_dialog.js";
import { exportieren, alsDateiHerunterladen, lesen } from "./ics.js";
import { zeigeFeiertage, zeigeFerien } from "./feiertage.js";

const ANSICHTEN = ["monat", "woche", "tag"];

const zustand = {
  ansicht: "monat",
  anker: heuteSchluessel(),
};

const kontext = {
  profile: new Map(),
  kategorien: new Map(),
  eigenesProfil: null,
  aufTerminKlick: (v) => dialog.vorhandenerTermin(v),
  aufTagKlick: (schluessel, minuten) => dialog.neuerTermin(schluessel, minuten),
  aufTagWechsel: (schluessel) => setzeZustand("tag", schluessel),
  nachAenderung: () => neuZeichnen(),
};

let dialog = null;
const inhalt = document.getElementById("inhalt");
const zeitraumFeld = document.getElementById("zeitraum");

// ------------------------------------------------------------
//  Zustand und Adresszeile
// ------------------------------------------------------------
//  Ansicht und Datum stehen im Anker der Adresse, damit Neuladen,
//  Lesezeichen und der Zurueck-Knopf funktionieren.

function ausAdresse() {
  const [ansicht, datum] = location.hash.replace("#", "").split("/");
  if (ANSICHTEN.includes(ansicht)) zustand.ansicht = ansicht;
  if (/^\d{4}-\d{2}-\d{2}$/.test(datum ?? "")) zustand.anker = datum;
}

function inAdresse() {
  const neu = `#${zustand.ansicht}/${zustand.anker}`;
  if (location.hash !== neu) history.replaceState(null, "", neu);
}

function setzeZustand(ansicht, anker) {
  if (ansicht) zustand.ansicht = ansicht;
  if (anker) zustand.anker = anker;
  inAdresse();
  neuZeichnen();
}

// ------------------------------------------------------------
//  Zeitraum der aktuellen Ansicht
// ------------------------------------------------------------

function sichtbareTage() {
  if (zustand.ansicht === "monat") return monatsRaster(zustand.anker);
  if (zustand.ansicht === "woche") return wochenRaster(zustand.anker);
  return [zustand.anker];
}

function zeitraumText() {
  const { jahr, monat } = schluesselTeile(zustand.anker);
  if (zustand.ansicht === "monat") return `${MONATE[monat - 1]} ${jahr}`;
  if (zustand.ansicht === "tag") return datumLang(zustand.anker);

  const tage = wochenRaster(zustand.anker);
  return `${datumKurz(tage[0])} – ${datumKurz(tage[6])}`;
}

function blaettern(richtung) {
  if (zustand.ansicht === "monat") {
    const { jahr, monat } = schluesselTeile(zustand.anker);
    const zeiger = new Date(Date.UTC(jahr, monat - 1 + richtung, 1));
    setzeZustand(null, schluesselAus(zeiger.getUTCFullYear(), zeiger.getUTCMonth() + 1, 1));
  } else {
    setzeZustand(null, tagPlus(zustand.anker, richtung * (zustand.ansicht === "woche" ? 7 : 1)));
  }
}

// ------------------------------------------------------------
//  Zeichnen
// ------------------------------------------------------------

let laufendeAnfrage = 0;

async function neuZeichnen() {
  const meine = ++laufendeAnfrage;
  zeitraumFeld.textContent = zeitraumText();
  for (const knopf of document.querySelectorAll("[data-ansicht]")) {
    knopf.setAttribute("aria-pressed", String(knopf.dataset.ansicht === zustand.ansicht));
  }

  const tage = sichtbareTage();
  try {
    const vorkommen = await termineLaden(tage[0], tage.at(-1));
    // Zwischenzeitlich wurde schon wieder geblaettert - Ergebnis verwerfen.
    if (meine !== laufendeAnfrage) return;

    if (zustand.ansicht === "monat") zeichneMonat(inhalt, vorkommen, zustand.anker, kontext);
    else if (zustand.ansicht === "woche") zeichneWoche(inhalt, vorkommen, zustand.anker, kontext);
    else zeichneTag(inhalt, vorkommen, zustand.anker, kontext);
  } catch (ex) {
    if (meine !== laufendeAnfrage) return;
    inhalt.replaceChildren(
      Object.assign(document.createElement("p"), {
        className: "lade-hinweis",
        textContent: `Die Termine konnten nicht geladen werden: ${ex.message ?? ex}`,
      }),
    );
  }
}

// ------------------------------------------------------------
//  ICS
// ------------------------------------------------------------

async function exportKlick(nurEigene) {
  try {
    const inhaltText = await exportieren({ nurEigene, eigeneId: kontext.eigenesProfil.id });
    const heute = heuteSchluessel();
    alsDateiHerunterladen(inhaltText, `kalender-${heute}.ics`);
  } catch (ex) {
    alert(`Export fehlgeschlagen: ${ex.message ?? ex}`);
  }
}

async function importKlick(datei) {
  try {
    const text = await datei.text();
    const gefunden = lesen(text);
    if (!gefunden.length) {
      alert("In dieser Datei standen keine Termine.");
      return;
    }
    const alleProfile = [...kontext.profile.keys()];
    if (!confirm(
      `${gefunden.length} Termin(e) gefunden.\n\n` +
      `Sie werden dir zugeordnet und sind zunächst für alle Profile sichtbar.\n` +
      `Jetzt importieren?`,
    )) return;

    let fehlgeschlagen = 0;
    for (const termin of gefunden) {
      try {
        await terminAnlegen({
          titel: termin.titel,
          ort: termin.ort ?? "",
          beschreibung: termin.beschreibung ?? "",
          beginn: termin.beginn,
          ende: termin.ende,
          ganztags: Boolean(termin.ganztags),
          kategorie_id: null,
          serie_regel: termin.serie_regel ?? null,
          ersteller_id: kontext.eigenesProfil.id,
        }, alleProfile);
      } catch {
        fehlgeschlagen++;
      }
    }
    await neuZeichnen();
    alert(fehlgeschlagen
      ? `${gefunden.length - fehlgeschlagen} übernommen, ${fehlgeschlagen} nicht lesbar.`
      : `${gefunden.length} Termin(e) übernommen.`);
  } catch (ex) {
    alert(`Import fehlgeschlagen: ${ex.message ?? ex}`);
  }
}

// ------------------------------------------------------------
//  Start
// ------------------------------------------------------------

// Konto vorhanden, aber nicht ueber den Einladungscode entstanden.
function zeigeNichtFreigeschaltet() {
  document.querySelector(".kopf")?.setAttribute("hidden", "");
  inhalt.replaceChildren();

  const kasten = document.createElement("div");
  kasten.className = "lade-hinweis";
  kasten.append(
    Object.assign(document.createElement("p"), {
      textContent: "Dieses Profil ist nicht freigeschaltet.",
      style: "font-weight:600",
    }),
    Object.assign(document.createElement("p"), {
      textContent:
        "Profile für diesen Kalender werden nur mit einem Einladungscode "
        + "angelegt. Wenn du einen Code hast, melde dich ab und lege das "
        + "Profil über „Neues Profil“ an.",
    }),
  );

  const abmeldenKnopf = Object.assign(document.createElement("button"), {
    className: "knopf", textContent: "Abmelden",
  });
  abmeldenKnopf.addEventListener("click", async () => {
    await abmelden();
    location.replace("index.html");
  });

  kasten.append(abmeldenKnopf);
  inhalt.append(kasten);
}

function zeigeStartfehler(ex) {
  const meldung = ex?.message ?? String(ex);
  inhalt.replaceChildren();
  const kasten = document.createElement("div");
  kasten.className = "lade-hinweis";
  kasten.append(
    Object.assign(document.createElement("p"), {
      textContent: "Der Kalender konnte nicht geladen werden.",
      style: "font-weight:600",
    }),
    Object.assign(document.createElement("p"), { textContent: meldung }),
  );

  const nochmal = Object.assign(document.createElement("button"), {
    className: "knopf", textContent: "Erneut versuchen",
  });
  nochmal.addEventListener("click", () => location.reload());

  const neuAnmelden = Object.assign(document.createElement("button"), {
    className: "knopf knopf--leise", textContent: "Neu anmelden",
  });
  neuAnmelden.addEventListener("click", async () => {
    await abmelden();
    location.replace("index.html");
  });

  kasten.append(nochmal, document.createTextNode(" "), neuAnmelden);
  inhalt.append(kasten);
}

// Direkt nach dem Anmelden kann das frische Token beim API-Server noch
// "aus der Zukunft" aussehen, wenn dessen Uhr Sekundenbruchteile
// nachgeht (PGRST303). Einmal kurz warten und erneut versuchen.
async function mitEinemZweitversuch(arbeit) {
  try {
    return await arbeit();
  } catch (ex) {
    const code = ex?.code ?? "";
    const text = ex?.message ?? "";
    const lohntSich = code === "PGRST303" || /issued at future|JWT/i.test(text);
    if (!lohntSich) throw ex;
    await new Promise((weiter) => setTimeout(weiter, 1500));
    return arbeit();
  }
}

async function starten() {
  if (!await verlangeAnmeldung()) return;

  const [profil, profile, kategorien] = await mitEinemZweitversuch(() => Promise.all([
    eigenesProfil(), profileLaden(), kategorienLaden(),
  ]));

  // Ein Profil zaehlt erst, wenn es ueber den Einladungscode entstanden
  // ist. Alles andere kann sich anmelden, sieht aber nichts - ohne diese
  // Meldung staende man vor einem leeren Kalender und wuesste nicht warum.
  if (profil && profil.freigeschaltet === false) {
    zeigeNichtFreigeschaltet();
    return;
  }

  kontext.eigenesProfil = profil ?? { id: null, name: "Ich", farbe: "#4a90d9" };
  kontext.profile = new Map(profile.map((p) => [p.id, p]));
  kontext.kategorien = new Map(kategorien.map((k) => [k.id, k]));

  const profilKnopf = document.getElementById("profil");
  profilKnopf.querySelector(".punkt").style.background = kontext.eigenesProfil.farbe;
  profilKnopf.querySelector("span:last-child").textContent = kontext.eigenesProfil.name;

  dialog = dialogAufsetzen(kontext);

  // Navigation
  document.getElementById("zurueck").addEventListener("click", () => blaettern(-1));
  document.getElementById("vor").addEventListener("click", () => blaettern(1));
  document.getElementById("heute").addEventListener("click", () => setzeZustand(null, heuteSchluessel()));
  for (const knopf of document.querySelectorAll("[data-ansicht]")) {
    knopf.addEventListener("click", () => setzeZustand(knopf.dataset.ansicht, null));
  }
  document.getElementById("neu").addEventListener("click", () => {
    dialog.neuerTermin(zustand.ansicht === "monat" ? heuteSchluessel() : zustand.anker, null);
  });

  // Menue: nach jeder Auswahl und bei Klick daneben wieder zuklappen.
  // Die Schalter sind davon ausgenommen - man will oft beide umlegen.
  const menue = document.querySelector(".menue");
  menue.querySelector(".menue__inhalt").addEventListener("click", (e) => {
    if (e.target.closest(".menue__schalter")) return;
    menue.open = false;
  });
  document.addEventListener("click", (e) => {
    if (menue.open && !menue.contains(e.target)) menue.open = false;
  });

  // Feiertage und Schulferien ein- und ausblenden.
  const schalterFeiertage = document.getElementById("schalter-feiertage");
  const schalterFerien = document.getElementById("schalter-ferien");
  schalterFeiertage.checked = zeigeFeiertage();
  schalterFerien.checked = zeigeFerien();
  schalterFeiertage.addEventListener("change", async () => {
    zeigeFeiertage(schalterFeiertage.checked);
    await neuZeichnen();
  });
  schalterFerien.addEventListener("change", async () => {
    zeigeFerien(schalterFerien.checked);
    await neuZeichnen();
  });

  document.getElementById("export-alle").addEventListener("click", () => exportKlick(false));
  document.getElementById("export-eigene").addEventListener("click", () => exportKlick(true));
  const importFeld = document.getElementById("import-datei");
  document.getElementById("import").addEventListener("click", () => importFeld.click());
  importFeld.addEventListener("change", async () => {
    const datei = importFeld.files?.[0];
    importFeld.value = "";
    if (datei) await importKlick(datei);
  });
  document.getElementById("abmelden").addEventListener("click", async () => {
    await abmelden();
    location.replace("index.html");
  });

  // Tastatur: Pfeile blaettern, M/W/T wechseln die Ansicht
  document.addEventListener("keydown", (e) => {
    // Tastenkombinationen gehoeren dem Browser, nicht uns.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Solange ein Dialog offen ist oder in ein Feld getippt wird: nichts tun.
    // Das Ziel ist nicht immer ein Element (z.B. das Dokument selbst),
    // deshalb vorher pruefen - sonst wirft closest() und alles steht.
    const ziel = e.target;
    if (ziel instanceof Element && ziel.closest("input, textarea, select, [contenteditable]")) return;
    if (document.querySelector("dialog[open]")) return;

    if (e.key === "ArrowLeft") blaettern(-1);
    else if (e.key === "ArrowRight") blaettern(1);
    else if (e.key.toLowerCase() === "m") setzeZustand("monat", null);
    else if (e.key.toLowerCase() === "w") setzeZustand("woche", null);
    else if (e.key.toLowerCase() === "t") setzeZustand("tag", null);
    else if (e.key.toLowerCase() === "h") setzeZustand(null, heuteSchluessel());
    else if (e.key === "n") dialog.neuerTermin(zustand.anker, null);
  });

  window.addEventListener("hashchange", () => { ausAdresse(); neuZeichnen(); });

  // Andere Geraete: Aenderungen kommen ueber Realtime herein.
  aufAenderungenHoeren(() => neuZeichnen());

  // Falls die Verbindung zwischendurch geschlafen hat: beim Zurueckkommen
  // sicherheitshalber neu laden.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") neuZeichnen();
  });

  ausAdresse();
  inAdresse();
  await neuZeichnen();
}

// Faellt der Start um, darf die App nicht stumm bei "wird geladen" stehen
// bleiben - dann waere fuer niemanden erkennbar, was los ist.
starten().catch(zeigeStartfehler);
