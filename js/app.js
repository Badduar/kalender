// ============================================================
//  Anwendung: Zustand, Navigation, Zeichnen
// ============================================================

import { verlangeAnmeldung, abmelden, eigenesProfil } from "./auth.js";
import {
  profileLaden, kategorienLaden, kalenderLaden, termineLaden, terminAnlegen,
  aufAenderungenHoeren, nurFreiGebuchtSetzen, tagesueberblickSetzen,
} from "./daten.js";
import {
  heuteSchluessel, schluesselTeile, schluesselAus, tagPlus, monatsRaster,
  wochenRaster, datumLang, datumKurz, MONATE,
} from "./zeit.js";
import { zeichneMonat } from "./ansicht_monat.js";
import { zeichneWoche } from "./ansicht_woche.js";
import { zeichneTag } from "./ansicht_tag.js";
import { zeichneUebersicht } from "./ansicht_uebersicht.js";
import { sucheAufsetzen } from "./suche.js";
import { verwaltungAufsetzen } from "./kalender_verwalten.js";
import { dialogAufsetzen } from "./termin_dialog.js";
import { exportieren, alsDateiHerunterladen, lesen } from "./ics.js";
import { zeigeFeiertage, zeigeFerien } from "./feiertage.js";
import {
  pushLage, istAngemeldet,
  anmelden as pushAnmelden, abmelden as pushAbmelden,
} from "./push.js";

const ANSICHTEN = ["monat", "woche", "tag", "uebersicht"];

const zustand = {
  ansicht: "monat",
  anker: heuteSchluessel(),
  // Aktiver Kalender. Steht bewusst nicht in der Adresszeile: welcher
  // Kalender offen ist, ist eine Einstellung dieses Geraets und nichts,
  // was man jemandem als Link schickt.
  kalenderId: null,
};

const KALENDER_SPEICHER = "kalender.aktiverKalender";

const kontext = {
  profile: new Map(),
  kategorien: new Map(),
  eigenesProfil: null,
  aufTerminKlick: (v) => dialog.vorhandenerTermin(v),
  aufTagKlick: (schluessel, minuten) => dialog.neuerTermin(schluessel, minuten),
  aufTagWechsel: (schluessel) => setzeZustand("tag", schluessel),
  aufUebersicht: (schluessel) => setzeZustand("uebersicht", schluessel),
  kalender: new Map(),
  aktiverKalender: () => zustand.kalenderId,
  kalenderWechseln: (id) => kalenderWechseln(id),
  kalenderNeuLaden: () => kalenderNeuLaden(),
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
//  Tageswechsel
// ------------------------------------------------------------
//  Der Anker wird beim Laden einmal gesetzt und bleibt danach stehen.
//  Laeuft die App ueber Mitternacht durch, zeigt die Monatsansicht
//  weiterhin den richtigen Tag markiert - sie rechnet "heute" bei jedem
//  Zeichnen neu. Woche, Tag und Uebersicht haengen dagegen am Anker und
//  wuerden auf gestern stehenbleiben.
//
//  Deshalb wird der Tageswechsel beobachtet. Stand der Anker auf dem
//  alten "heute", wandert er mit. Hat der Nutzer bewusst woanders
//  hingeblaettert, bleibt das unangetastet.

let bekannterTag = heuteSchluessel();

function tageswechselPruefen() {
  const jetzt = heuteSchluessel();
  if (jetzt === bekannterTag) return false;

  const standAufHeute = zustand.anker === bekannterTag;
  bekannterTag = jetzt;
  if (standAufHeute) zustand.anker = jetzt;

  inAdresse();
  neuZeichnen();
  return true;
}

// ------------------------------------------------------------
//  Kalender
// ------------------------------------------------------------
//  Der aktive Kalender bestimmt, welche EIGENEN Termine erscheinen
//  und wo neue landen. Termine anderer Profile bleiben immer
//  sichtbar - beim Umschalten auf "Dienst" soll einem nicht der
//  halbe Familienkalender wegbrechen.

function eigeneKalender() {
  return [...kontext.kalender.values()]
    .filter((k) => k.besitzer_id === kontext.eigenesProfil.id);
}

async function kalenderNeuLaden() {
  const liste = await kalenderLaden();
  kontext.kalender = new Map(liste.map((k) => [k.id, k]));

  // Der gemerkte Kalender kann inzwischen entfernt worden sein.
  const meine = eigeneKalender();
  if (!meine.some((k) => k.id === zustand.kalenderId)) {
    zustand.kalenderId = meine[0]?.id ?? null;
    kalenderMerken();
  }
  kalenderwahlFuellen();
}

function kalenderMerken() {
  try {
    if (zustand.kalenderId) localStorage.setItem(KALENDER_SPEICHER, zustand.kalenderId);
  } catch { /* privates Fenster - dann eben nur fuer diese Sitzung */ }
}

function kalenderwahlFuellen() {
  const wahl = document.getElementById("kalender-wahl");
  const punkt = document.getElementById("kalender-punkt");
  const meine = eigeneKalender();

  wahl.replaceChildren();
  for (const k of meine) wahl.append(new Option(k.name, k.id));
  if (zustand.kalenderId) wahl.value = zustand.kalenderId;
  if (wahl.selectedIndex < 0 && meine.length) {
    wahl.selectedIndex = 0;
    zustand.kalenderId = meine[0].id;
  }

  const aktiv = kontext.kalender.get(zustand.kalenderId);
  punkt.style.background = aktiv?.farbe ?? "transparent";

  // Bei nur einem Kalender waere die Auswahl nur Beiwerk.
  document.querySelector(".kalenderwahl").hidden = meine.length < 2;
}

function kalenderWechseln(id) {
  if (!id || id === zustand.kalenderId) return;
  zustand.kalenderId = id;
  kalenderMerken();
  kalenderwahlFuellen();
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
  if (zustand.ansicht === "uebersicht") return datumLang(zustand.anker);

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

// Eigene Termine nur aus dem aktiven Kalender, fremde immer.
// Termine ohne Kalender (aus der Zeit vor dieser Funktion) bleiben
// sichtbar - sie sollen nicht unsichtbar werden, nur weil sie alt sind.
function nurAktiverKalender(liste) {
  const eigenesId = kontext.eigenesProfil?.id;
  if (!zustand.kalenderId || !eigenesId) return liste;
  return liste.filter((v) => {
    const t = v.termin;
    if (t.ersteller_id !== eigenesId) return true;
    if (!t.kalender_id) return true;
    return t.kalender_id === zustand.kalenderId;
  });
}

async function neuZeichnen() {
  const meine = ++laufendeAnfrage;
  zeitraumFeld.textContent = zeitraumText();
  for (const knopf of document.querySelectorAll("[data-ansicht]")) {
    knopf.setAttribute("aria-pressed", String(knopf.dataset.ansicht === zustand.ansicht));
  }

  const tage = sichtbareTage();
  try {
    const geladen = await termineLaden(tage[0], tage.at(-1));
    // Zwischenzeitlich wurde schon wieder geblaettert - Ergebnis verwerfen.
    if (meine !== laufendeAnfrage) return;

    const vorkommen = nurAktiverKalender(geladen);

    if (zustand.ansicht === "monat") zeichneMonat(inhalt, vorkommen, zustand.anker, kontext);
    else if (zustand.ansicht === "woche") zeichneWoche(inhalt, vorkommen, zustand.anker, kontext);
    else if (zustand.ansicht === "uebersicht") zeichneUebersicht(inhalt, vorkommen, zustand.anker, kontext);
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
          kalender_id: zustand.kalenderId,
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

  const [profil, profile, kategorien, kalender] = await mitEinemZweitversuch(() => Promise.all([
    eigenesProfil(), profileLaden(), kategorienLaden(), kalenderLaden(),
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
  kontext.kalender = new Map(kalender.map((k) => [k.id, k]));

  // Zuletzt benutzter Kalender, sonst der erste eigene.
  let gemerkt = null;
  try { gemerkt = localStorage.getItem(KALENDER_SPEICHER); } catch { /* egal */ }
  const meine = eigeneKalender();
  zustand.kalenderId = meine.some((k) => k.id === gemerkt) ? gemerkt : (meine[0]?.id ?? null);
  kalenderwahlFuellen();

  const profilKnopf = document.getElementById("profil");
  profilKnopf.querySelector(".punkt").style.background = kontext.eigenesProfil.farbe;
  profilKnopf.querySelector("span:last-child").textContent = kontext.eigenesProfil.name;

  dialog = dialogAufsetzen(kontext);
  const suche = sucheAufsetzen(kontext);
  document.getElementById("suche-oeffnen").addEventListener("click", () => suche.oeffnen());

  const verwaltung = verwaltungAufsetzen(kontext);
  document.getElementById("kalender-verwalten")
    .addEventListener("click", () => verwaltung.oeffnen());
  document.getElementById("kalender-wahl")
    .addEventListener("change", (e) => kalenderWechseln(e.target.value));

  // Navigation
  document.getElementById("zurueck").addEventListener("click", () => blaettern(-1));
  document.getElementById("vor").addEventListener("click", () => blaettern(1));
  document.getElementById("heute").addEventListener("click", () => setzeZustand(null, heuteSchluessel()));
  for (const knopf of document.querySelectorAll("[data-ansicht]")) {
    knopf.addEventListener("click", () => {
      // Die Übersicht ist zum Nachsehen "was ist heute" gedacht und
      // springt deshalb immer auf den heutigen Tag. Blättern geht danach.
      const anker = knopf.dataset.ansicht === "uebersicht" ? heuteSchluessel() : null;
      setzeZustand(knopf.dataset.ansicht, anker);
    });
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

  // Ganzen Kalender auf "nur belegt" stellen.
  const schalterFreiGebucht = document.getElementById("schalter-frei-gebucht");
  schalterFreiGebucht.checked = Boolean(kontext.eigenesProfil.nur_frei_gebucht);
  schalterFreiGebucht.addEventListener("change", async () => {
    const an = schalterFreiGebucht.checked;
    schalterFreiGebucht.disabled = true;
    try {
      await nurFreiGebuchtSetzen(kontext.eigenesProfil.id, an);
      kontext.eigenesProfil.nur_frei_gebucht = an;
    } catch (ex) {
      // Zurueckstellen, damit der Haken nicht etwas behauptet,
      // was auf dem Server nicht steht.
      schalterFreiGebucht.checked = !an;
      alert(`Einstellung konnte nicht gespeichert werden: ${ex.message ?? ex}`);
    } finally {
      schalterFreiGebucht.disabled = false;
    }
  });

  // Erinnerungen auf diesem Geraet an- und abmelden.
  const schalterPush = document.getElementById("schalter-push");
  const pushHinweis = document.getElementById("push-hinweis");

  async function pushAnzeigeAuffrischen() {
    const lage = pushLage();
    if (!lage.moeglich) {
      schalterPush.checked = false;
      schalterPush.disabled = true;
      pushHinweis.textContent = lage.grund;
      return;
    }
    schalterPush.disabled = false;
    schalterPush.checked = await istAngemeldet();
    pushHinweis.textContent = schalterPush.checked
      ? "Dieses Gerät bekommt Erinnerungen zu deinen Terminen."
      : "Erinnerungen kommen nur auf Geräten an, die hier angemeldet sind.";
  }
  await pushAnzeigeAuffrischen();

  schalterPush.addEventListener("change", async () => {
    const an = schalterPush.checked;
    schalterPush.disabled = true;
    pushHinweis.textContent = an ? "Wird angemeldet …" : "Wird abgemeldet …";
    try {
      if (an) await pushAnmelden(kontext.eigenesProfil.id);
      else await pushAbmelden();
    } catch (ex) {
      pushHinweis.textContent = ex.message ?? String(ex);
      schalterPush.checked = !an;
      schalterPush.disabled = false;
      return;
    }
    await pushAnzeigeAuffrischen();
  });

  // Morgens ein Ueberblick ueber den Tag.
  const schalterUeberblick = document.getElementById("schalter-ueberblick");
  const ueberblickZeile = document.getElementById("ueberblick-zeile");
  const ueberblickZeit = document.getElementById("ueberblick-zeit");
  const ueberblickHinweis = document.getElementById("ueberblick-hinweis");

  // Die Datenbank liefert "07:00:00", das Eingabefeld will "07:00".
  function ueberblickAnzeigen(gespeichert) {
    schalterUeberblick.checked = Boolean(gespeichert);
    ueberblickZeile.hidden = !gespeichert;
    if (gespeichert) ueberblickZeit.value = String(gespeichert).slice(0, 5);
    ueberblickHinweis.textContent = gespeichert
      ? `Jeden Morgen um ${String(gespeichert).slice(0, 5)} Uhr kommt eine Meldung mit den Terminen des Tages.`
      : "Eine Meldung am Morgen mit allem, was an dem Tag ansteht.";
  }
  ueberblickAnzeigen(kontext.eigenesProfil.tagesueberblick_um);

  async function ueberblickSpeichern(zeit) {
    schalterUeberblick.disabled = true;
    ueberblickZeit.disabled = true;
    try {
      await tagesueberblickSetzen(kontext.eigenesProfil.id, zeit);
      kontext.eigenesProfil.tagesueberblick_um = zeit;
      ueberblickAnzeigen(zeit);
    } catch (ex) {
      // Nicht die alte Anzeige stehen lassen, die etwas behauptet,
      // was auf dem Server nicht steht.
      ueberblickAnzeigen(kontext.eigenesProfil.tagesueberblick_um);
      ueberblickHinweis.textContent = `Konnte nicht gespeichert werden: ${ex.message ?? ex}`;
    } finally {
      schalterUeberblick.disabled = false;
      ueberblickZeit.disabled = false;
    }
  }

  schalterUeberblick.addEventListener("change", () => {
    ueberblickSpeichern(schalterUeberblick.checked ? ueberblickZeit.value : null);
  });
  ueberblickZeit.addEventListener("change", () => {
    if (schalterUeberblick.checked && ueberblickZeit.value) {
      ueberblickSpeichern(ueberblickZeit.value);
    }
  });

  // App aktualisieren: Zwischenspeicher leeren und frisch laden.
  document.getElementById("aktualisieren").addEventListener("click", async () => {
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
      await Promise.all(regs.map((r) => r.unregister()));
      const namen = await caches?.keys?.() ?? [];
      await Promise.all(namen.map((n) => caches.delete(n)));
    } catch { /* dann eben nur neu laden */ }
    // Anker abschneiden, damit auch die Startseite frisch kommt.
    location.replace(location.pathname + "?frisch=" + Date.now());
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

  // Tastatur: Pfeile blaettern, M/W/T/Ü wechseln die Ansicht
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
    else if (e.key.toLowerCase() === "ü") setzeZustand("uebersicht", heuteSchluessel());
    else if (e.key === "n") dialog.neuerTermin(zustand.anker, null);
    else if (e.key === "/") { e.preventDefault(); suche.oeffnen(); }
  });

  window.addEventListener("hashchange", () => { ausAdresse(); neuZeichnen(); });

  // Andere Geraete: Aenderungen kommen ueber Realtime herein.
  aufAenderungenHoeren(() => neuZeichnen());

  // Falls die Verbindung zwischendurch geschlafen hat: beim Zurueckkommen
  // sicherheitshalber neu laden.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (!tageswechselPruefen()) neuZeichnen();
  });
  window.addEventListener("focus", tageswechselPruefen);

  // Bleibt die App ueber Mitternacht offen, waere das Datum sonst
  // eingefroren. Einmal je Minute reicht - genauer muss es nicht sein.
  setInterval(tageswechselPruefen, 60_000);

  ausAdresse();
  inAdresse();
  await neuZeichnen();
}

// Faellt der Start um, darf die App nicht stumm bei "wird geladen" stehen
// bleiben - dann waere fuer niemanden erkennbar, was los ist.
starten().catch(zeigeStartfehler);
