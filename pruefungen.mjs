// Prüfungen für Zeitrechnung und Serientermine.
//
// Aufruf im Projektordner:
//     node pruefungen.mjs
//
// Läuft ohne Netz und ohne Datenbank. Sinnvoll ist ein Durchlauf mit
// fremder Zeitzone - das Ergebnis muss identisch sein:
//     TZ=Asia/Tokyo node pruefungen.mjs        (Linux/macOS)
//     $env:TZ="Asia/Tokyo"; node pruefungen.mjs  (PowerShell)
import {
  vonWanduhr, schluesselVon, uhrzeit, tagPlus, wochentag, wochenAnfang,
  monatsRaster, tageDazwischen, ausEingabe, fuerEingabe, teile,
} from "./js/zeit.js";
import {
  serienTage, regelSchreiben, regelLesen, regelText, vorkommen, serienEnde,
} from "./js/serie.js";
import {
  ostersonntag, feiertageImJahr, feiertagAn,
  ferienAn, SCHULFERIEN, FERIEN_BIS,
} from "./js/feiertage.js";

let fehler = 0;
function pruefe(name, ist, soll) {
  const a = JSON.stringify(ist), b = JSON.stringify(soll);
  if (a === b) { console.log(`  ok   ${name}`); }
  else { console.log(`  FEHL ${name}\n       ist:  ${a}\n       soll: ${b}`); fehler++; }
}

console.log("\n--- Zeitzone / Wanduhr ---");
// Winterzeit: Berlin = UTC+1
pruefe("24.03.2026 09:00 Berlin -> UTC",
  vonWanduhr(2026, 3, 24, 9, 0).toISOString(), "2026-03-24T08:00:00.000Z");
// Sommerzeit ab 29.03.2026: Berlin = UTC+2
pruefe("31.03.2026 09:00 Berlin -> UTC",
  vonWanduhr(2026, 3, 31, 9, 0).toISOString(), "2026-03-31T07:00:00.000Z");
pruefe("27.10.2026 09:00 Berlin -> UTC (wieder Winterzeit)",
  vonWanduhr(2026, 10, 27, 9, 0).toISOString(), "2026-10-27T08:00:00.000Z");
pruefe("Mitternacht 01.01.2026 Berlin",
  vonWanduhr(2026, 1, 1).toISOString(), "2025-12-31T23:00:00.000Z");
pruefe("Schluessel aus Zeitpunkt (kurz vor Mitternacht Berlin)",
  schluesselVon(new Date("2026-06-30T21:30:00Z")), "2026-06-30");
pruefe("Schluessel aus Zeitpunkt (nach Mitternacht Berlin)",
  schluesselVon(new Date("2026-06-30T22:30:00Z")), "2026-07-01");
pruefe("Eingabe hin und zurueck",
  fuerEingabe(ausEingabe("2026-09-04T14:45")), "2026-09-04T14:45");

console.log("\n--- Datumsrechnen ---");
pruefe("tagPlus ueber Monatsgrenze", tagPlus("2026-01-31", 1), "2026-02-01");
pruefe("tagPlus rueckwaerts", tagPlus("2026-03-01", -1), "2026-02-28");
pruefe("tagPlus ueber Sommerzeit", tagPlus("2026-03-28", 3), "2026-03-31");
pruefe("wochentag 04.09.2026 (Freitag)", wochentag("2026-09-04"), 4);
pruefe("wochenAnfang", wochenAnfang("2026-09-04"), "2026-08-31");
pruefe("Monatsraster hat 42 Tage", monatsRaster("2026-09-15").length, 42);
pruefe("Monatsraster startet am Montag", monatsRaster("2026-09-15")[0], "2026-08-31");
pruefe("tageDazwischen ueber Sommerzeit", tageDazwischen("2026-03-28", "2026-03-31"), 3);

console.log("\n--- Regeln lesen/schreiben ---");
pruefe("Regel schreiben (woechentlich Mo+Do)",
  regelSchreiben({ haeufigkeit: "WEEKLY", intervall: 2, wochentage: [0, 3], anzahl: null, bis: "2026-12-31" }),
  "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;UNTIL=20261231");
pruefe("Regel lesen", regelLesen("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;UNTIL=20261231"),
  { haeufigkeit: "WEEKLY", intervall: 2, wochentage: [0, 3], monatstag: null, anzahl: null, bis: "2026-12-31" });
pruefe("Klartext", regelText("FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH"), "Alle 2 Wochen am Montag und Donnerstag");

console.log("\n--- Serientage ---");
pruefe("taeglich, 5 Mal",
  serienTage("2026-09-01", "FREQ=DAILY;COUNT=5", "2026-01-01", "2026-12-31"),
  ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]);
pruefe("jeden 2. Tag bis 10.09.",
  serienTage("2026-09-01", "FREQ=DAILY;INTERVAL=2;UNTIL=20260910", "2026-01-01", "2026-12-31"),
  ["2026-09-01", "2026-09-03", "2026-09-05", "2026-09-07", "2026-09-09"]);
pruefe("woechentlich Di, ueber Sommerzeit hinweg",
  serienTage("2026-03-24", "FREQ=WEEKLY", "2026-03-24", "2026-04-14"),
  ["2026-03-24", "2026-03-31", "2026-04-07", "2026-04-14"]);
pruefe("woechentlich Mo+Fr, COUNT=5",
  serienTage("2026-09-07", "FREQ=WEEKLY;BYDAY=MO,FR;COUNT=5", "2026-01-01", "2026-12-31"),
  ["2026-09-07", "2026-09-11", "2026-09-14", "2026-09-18", "2026-09-21"]);
pruefe("monatlich am 31. laesst kurze Monate aus",
  serienTage("2026-01-31", "FREQ=MONTHLY;COUNT=5", "2026-01-01", "2026-12-31"),
  ["2026-01-31", "2026-03-31", "2026-05-31", "2026-07-31", "2026-08-31"]);
pruefe("jaehrlich",
  serienTage("2026-02-14", "FREQ=YEARLY;COUNT=3", "2020-01-01", "2035-12-31"),
  ["2026-02-14", "2027-02-14", "2028-02-14"]);
pruefe("Fenster schneidet korrekt aus",
  serienTage("2026-01-01", "FREQ=DAILY", "2026-06-01", "2026-06-03"),
  ["2026-06-01", "2026-06-02", "2026-06-03"]);
pruefe("serienEnde bei COUNT",
  serienEnde("2026-09-01", "FREQ=DAILY;COUNT=5"), "2026-09-05");
pruefe("serienEnde unbegrenzt", serienEnde("2026-09-01", "FREQ=DAILY"), null);

console.log("\n--- Vorkommen mit Uhrzeit ---");
const woechentlich = {
  id: "t1", titel: "Sport", ganztags: false,
  beginn: vonWanduhr(2026, 3, 24, 9, 0).toISOString(),
  ende: vonWanduhr(2026, 3, 24, 10, 0).toISOString(),
  serie_regel: "FREQ=WEEKLY", ausnahmen: [],
};
const v1 = vorkommen(woechentlich, "2026-03-20", "2026-04-05");
pruefe("Anzahl Vorkommen im Fenster", v1.map((v) => v.schluessel),
  ["2026-03-24", "2026-03-31"]);
pruefe("Uhrzeit bleibt 09:00 vor der Umstellung", uhrzeit(v1[0].beginn), "09:00");
pruefe("Uhrzeit bleibt 09:00 nach der Umstellung", uhrzeit(v1[1].beginn), "09:00");
pruefe("UTC verschiebt sich korrekt", v1[1].beginn.toISOString(), "2026-03-31T07:00:00.000Z");
pruefe("Dauer bleibt 1 Stunde", (v1[1].ende - v1[1].beginn) / 60000, 60);

console.log("\n--- Ausnahmen ---");
const mitAusnahmen = {
  ...woechentlich,
  ausnahmen: [
    { original_datum: "2026-03-31", geloescht: true },
    { original_datum: "2026-04-07", geloescht: false, titel: "Sport (verlegt)",
      beginn: vonWanduhr(2026, 4, 7, 18, 0).toISOString(),
      ende: vonWanduhr(2026, 4, 7, 19, 0).toISOString() },
  ],
};
const v2 = vorkommen(mitAusnahmen, "2026-03-20", "2026-04-14");
pruefe("geloeschtes Vorkommen faellt weg", v2.map((v) => v.schluessel),
  ["2026-03-24", "2026-04-07", "2026-04-14"]);
pruefe("verschobenes Vorkommen hat neue Zeit", uhrzeit(v2[1].beginn), "18:00");
pruefe("verschobenes Vorkommen hat neuen Titel", v2[1].termin.titel, "Sport (verlegt)");
pruefe("uebrige Vorkommen unveraendert", uhrzeit(v2[2].beginn), "09:00");

console.log("\n--- Ganztaegig / mehrtaegig ---");
const urlaub = {
  id: "t2", titel: "Urlaub", ganztags: true,
  beginn: vonWanduhr(2026, 3, 27, 0, 0).toISOString(),
  ende: vonWanduhr(2026, 3, 30, 0, 0).toISOString(),
  serie_regel: null, ausnahmen: [],
};
const v3 = vorkommen(urlaub, "2026-03-01", "2026-04-30");
pruefe("Einzeltermin liefert ein Vorkommen", v3.length, 1);
pruefe("Urlaub endet an Mitternacht Berlin trotz Umstellung",
  schluesselVon(new Date(v3[0].ende.getTime() - 1)), "2026-03-29");

const jaehrlichGanztags = {
  id: "t3", titel: "Geburtstag", ganztags: true,
  beginn: vonWanduhr(2026, 3, 28, 0, 0).toISOString(),
  ende: vonWanduhr(2026, 3, 29, 0, 0).toISOString(),
  serie_regel: "FREQ=YEARLY;COUNT=2", ausnahmen: [],
};
const v4 = vorkommen(jaehrlichGanztags, "2026-01-01", "2028-12-31");
pruefe("jaehrlich ganztags: Anzahl", v4.length, 2);
pruefe("jaehrlich ganztags: Beginn ist Mitternacht",
  v4.map((v) => teile(v.beginn).stunde), [0, 0]);
// 28.03.2027 ist selbst ein Umstellungstag und hat nur 23 Stunden.
// Richtig ist deshalb nicht "immer 24 Stunden", sondern "genau ein Kalendertag".
pruefe("jaehrlich ganztags: deckt genau einen Kalendertag ab",
  v4.map((v) => [v.schluessel, schluesselVon(new Date(v.ende.getTime() - 1))]),
  [["2026-03-28", "2026-03-28"], ["2027-03-28", "2027-03-28"]]);
pruefe("jaehrlich ganztags: Umstellungstag ist 23 Stunden lang",
  Math.round((v4[1].ende - v4[1].beginn) / 3600000), 23);

console.log("\n--- Termin ausserhalb des Fensters ---");
pruefe("mehrtaegiger Termin, der ins Fenster hineinragt",
  vorkommen(urlaub, "2026-03-29", "2026-03-31").length, 1);
pruefe("Termin weit vor dem Fenster",
  vorkommen(urlaub, "2026-06-01", "2026-06-30").length, 0);

console.log("\n--- Ostersonntag ---");
// Bekannte Osterdaten als Gegenprobe zur Osterformel.
pruefe("Ostern 2024", ostersonntag(2024), "2024-03-31");
pruefe("Ostern 2025", ostersonntag(2025), "2025-04-20");
pruefe("Ostern 2026", ostersonntag(2026), "2026-04-05");
pruefe("Ostern 2027", ostersonntag(2027), "2027-03-28");
pruefe("Ostern 2028", ostersonntag(2028), "2028-04-16");
pruefe("Ostern 2029", ostersonntag(2029), "2029-04-01");
pruefe("Ostern 2030", ostersonntag(2030), "2030-04-21");
pruefe("Ostern 2038 (spaeter Termin)", ostersonntag(2038), "2038-04-25");
pruefe("Ostern 2008 (frueher Termin)", ostersonntag(2008), "2008-03-23");

console.log("\n--- Feiertage Hamburg ---");
pruefe("Hamburg hat 10 gesetzliche Feiertage", feiertageImJahr(2027).size, 10);
pruefe("Karfreitag 2027", feiertagAn("2027-03-26"), "Karfreitag");
pruefe("Ostermontag 2027", feiertagAn("2027-03-29"), "Ostermontag");
pruefe("Christi Himmelfahrt 2027", feiertagAn("2027-05-06"), "Christi Himmelfahrt");
pruefe("Pfingstmontag 2027", feiertagAn("2027-05-17"), "Pfingstmontag");
pruefe("Neujahr", feiertagAn("2027-01-01"), "Neujahr");
pruefe("Tag der Arbeit", feiertagAn("2027-05-01"), "Tag der Arbeit");
pruefe("Tag der Deutschen Einheit", feiertagAn("2027-10-03"), "Tag der Deutschen Einheit");
pruefe("Reformationstag (in HH gesetzlich)", feiertagAn("2027-10-31"), "Reformationstag");
pruefe("2. Weihnachtstag", feiertagAn("2027-12-26"), "2. Weihnachtstag");
pruefe("Ostersonntag ist KEIN gesetzlicher Feiertag", feiertagAn("2027-03-28"), null);
pruefe("Fronleichnam gilt in HH nicht", feiertagAn("2027-05-27"), null);
pruefe("gewoehnlicher Tag", feiertagAn("2027-06-15"), null);
// Jahreswechsel: die beweglichen Tage duerfen nicht ins Nachbarjahr rutschen
pruefe("Karfreitag 2029", feiertagAn("2029-03-30"), "Karfreitag");
pruefe("Karfreitag 2030", feiertagAn("2030-04-19"), "Karfreitag");

console.log("\n--- Schulferien Hamburg ---");
pruefe("erster Tag der Herbstferien 2026", ferienAn("2026-10-19")?.name, "Herbstferien");
pruefe("letzter Tag der Herbstferien 2026", ferienAn("2026-10-30")?.name, "Herbstferien");
pruefe("Tag davor ist frei von Ferien", ferienAn("2026-10-18"), null);
pruefe("Tag danach ist frei von Ferien", ferienAn("2026-10-31"), null);
pruefe("Weihnachtsferien ueber den Jahreswechsel", ferienAn("2027-01-01")?.name, "Weihnachtsferien");
pruefe("Halbjahrespause ist ein einzelner Tag", ferienAn("2027-01-29")?.name, "Halbjahrespause");
pruefe("Sommerferien 2028 Beginn", ferienAn("2028-07-03")?.name, "Sommerferien");
pruefe("Sommerferien 2028 Ende", ferienAn("2028-08-11")?.name, "Sommerferien");
pruefe("Brückentag 2028", ferienAn("2028-10-30")?.name, "Brückentag");
pruefe("letzter erfasster Ferientag", ferienAn(FERIEN_BIS)?.name, "Sommerferien");
pruefe("danach ist die Tabelle zu Ende", ferienAn("2030-08-15"), null);

// Zeitraeume duerfen sich nicht ueberschneiden und muessen aufsteigend sein.
let ueberschneidung = null;
for (let i = 1; i < SCHULFERIEN.length; i++) {
  if (SCHULFERIEN[i].von <= SCHULFERIEN[i - 1].bis) {
    ueberschneidung = `${SCHULFERIEN[i - 1].name} / ${SCHULFERIEN[i].name}`;
    break;
  }
}
pruefe("Ferienzeitraeume ueberschneiden sich nicht", ueberschneidung, null);
pruefe("jeder Zeitraum beginnt vor seinem Ende",
  SCHULFERIEN.filter((z) => z.von > z.bis).length, 0);

console.log("\n--- Versand rechnet wie die Anzeige ---");
// Die Edge Function kann die Module der App nicht laden (der
// Edge-Runtime laesst keine Fernimporte zu), sie bekommt Kopien.
// Hier wird geprueft, dass beide Fassungen gleich rechnen - sonst
// wuerden Erinnerungen zu anderen Zeiten verschickt als angezeigt.
const versand = await import("./supabase/funktionen/erinnerungen/serie.js");

const faelle = [
  ["FREQ=DAILY", "2026-01-05"],
  ["FREQ=DAILY;INTERVAL=3;COUNT=7", "2026-01-05"],
  ["FREQ=WEEKLY", "2026-03-24"],
  ["FREQ=WEEKLY;BYDAY=MO,MI,FR", "2026-09-07"],
  ["FREQ=WEEKLY;BYDAY=SA,SU;INTERVAL=2", "2026-10-24"],
  ["FREQ=WEEKLY;UNTIL=20261231", "2026-06-01"],
  ["FREQ=MONTHLY", "2026-01-31"],
  ["FREQ=MONTHLY;BYMONTHDAY=15;INTERVAL=2", "2026-02-15"],
  ["FREQ=YEARLY;COUNT=4", "2026-02-29"],
  ["FREQ=YEARLY", "2026-12-25"],
];

let abweichung = null;
for (const [regel, start] of faelle) {
  for (const [von, bis] of [
    ["2026-01-01", "2026-12-31"],
    ["2026-03-25", "2026-04-02"],   // Sommerzeit-Umstellung
    ["2026-10-22", "2026-11-02"],   // Winterzeit-Umstellung
    ["2027-01-01", "2029-12-31"],
  ]) {
    const a = JSON.stringify(serienTage(start, regel, von, bis));
    const b = JSON.stringify(versand.serienTage(start, regel, von, bis));
    if (a !== b) { abweichung = `${regel} @ ${start} [${von}..${bis}]`; break; }

    const termin = {
      titel: "X", ganztags: false,
      beginn: vonWanduhr(...start.split("-").map(Number), 9, 30).toISOString(),
      ende: vonWanduhr(...start.split("-").map(Number), 10, 45).toISOString(),
      serie_regel: regel,
      ausnahmen: [{ original_datum: start, geloescht: false, titel: "Y",
        beginn: vonWanduhr(...start.split("-").map(Number), 18, 0).toISOString(),
        ende: vonWanduhr(...start.split("-").map(Number), 19, 0).toISOString() }],
    };
    const kurz = (liste) => liste.map((v) =>
      [v.schluessel, v.beginn.toISOString(), v.ende.toISOString(), v.termin.titel].join("|"));
    const x = JSON.stringify(kurz(vorkommen(termin, von, bis)));
    const y = JSON.stringify(kurz(versand.vorkommen(termin, von, bis)));
    if (x !== y) { abweichung = `vorkommen: ${regel} @ ${start} [${von}..${bis}]`; break; }
  }
  if (abweichung) break;
}
pruefe("App und Versand liefern identische Vorkommen", abweichung, null);

// Feiertage und Ferien braucht der Tagesueberblick ebenfalls. Die
// Ferientabelle ist keine Rechnung, sondern abgeschriebene Behoerden-
// daten - genau dort waere Auseinanderlaufen am unauffaelligsten.
// Deshalb Tag fuer Tag ueber den ganzen erfassten Zeitraum vergleichen.
const versandFeiertage = await import("./supabase/funktionen/erinnerungen/feiertage.js");

let ferienAbweichung = null;
let ferienTageGeprueft = 0;
for (let tag = "2024-01-01"; tag <= "2031-12-31"; tag = tagPlus(tag, 1)) {
  ferienTageGeprueft += 1;
  if (feiertagAn(tag) !== versandFeiertage.feiertagAn(tag)) {
    ferienAbweichung = `Feiertag am ${tag}`;
    break;
  }
  if ((ferienAn(tag)?.name ?? null) !== (versandFeiertage.ferienAn(tag)?.name ?? null)) {
    ferienAbweichung = `Ferien am ${tag}`;
    break;
  }
}
pruefe("App und Versand kennen dieselben Feiertage und Ferien", ferienAbweichung, null);
pruefe("dabei wurden alle Tage von 2024 bis 2031 geprüft", ferienTageGeprueft, 2922);
pruefe("Ferienende ist in beiden Fassungen gleich", versandFeiertage.FERIEN_BIS, FERIEN_BIS);

console.log("\n--- Tagesüberblick am Morgen ---");

const { ueberblickBauen } = await import("./supabase/funktionen/erinnerungen/ueberblick.js");

// Die Zeilen kommen so aus termine_im_zeitraum_fuer: verdeckte Termine
// ohne Titel, dafuer mit verdeckt = true.
function zeile(felder) {
  return {
    ganztags: false, serie_regel: null, ausnahmen: [], verdeckt: false, ...felder,
  };
}
const std = (tag, stunde, minute = 0) => vonWanduhr(...tag.split("-").map(Number), stunde, minute).toISOString();

const TAG = "2026-09-15";   // ein gewoehnlicher Dienstag, keine Ferien
pruefe("gewöhnlicher Tag ohne Termine schweigt", ueberblickBauen([], TAG), null);

const einer = ueberblickBauen([
  zeile({ titel: "Zahnarzt", beginn: std(TAG, 9), ende: std(TAG, 10) }),
], TAG);
pruefe("ein Termin: Überschrift", einer.titel, "Heute: 1 Termin");
pruefe("ein Termin: Text", einer.text, "09:00  Zahnarzt");

const gemischt = ueberblickBauen([
  zeile({ titel: "Abendessen", beginn: std(TAG, 19), ende: std(TAG, 21) }),
  zeile({ titel: "Urlaub", ganztags: true, beginn: std(TAG, 0), ende: std("2026-09-16", 0) }),
  zeile({ titel: null, verdeckt: true, beginn: std(TAG, 11), ende: std(TAG, 12) }),
], TAG);
pruefe("drei Termine: Überschrift", gemischt.titel, "Heute: 3 Termine");
pruefe("ganztägig steht oben, dann nach Uhrzeit",
  gemischt.text, "ganztägig  Urlaub\n11:00  Belegt\n19:00  Abendessen");

// Der wichtigste Fall: was verborgen ist, bleibt auch hier verborgen.
pruefe("verdeckter Termin verrät seinen Titel nicht",
  gemischt.text.includes("Belegt") && !gemischt.text.includes("null"), true);

const viele = ueberblickBauen(
  Array.from({ length: 9 }, (_, i) =>
    zeile({ titel: `Termin ${i + 1}`, beginn: std(TAG, 8 + i), ende: std(TAG, 9 + i) })),
  TAG,
);
pruefe("viele Termine: Überschrift zählt alle", viele.titel, "Heute: 9 Termine");
pruefe("viele Termine: Liste wird gekürzt", viele.text.split("\n").length, 7);
pruefe("viele Termine: Hinweis auf den Rest", viele.text.endsWith("… und 3 weitere"), true);

// Feiertag und Ferien melden sich auch ohne Termin.
const feiertag = ueberblickBauen([], "2026-10-03");
pruefe("Feiertag ohne Termine meldet sich", feiertag.titel, "Heute: keine Termine");
pruefe("Feiertag steht im Text", feiertag.text, "Tag der Deutschen Einheit");
pruefe("Ferientag ohne Termine meldet sich",
  ueberblickBauen([], "2026-10-20").text, "Herbstferien");

// Serien muessen auch hier expandiert werden - sonst fehlt der
// woechentliche Termin im Ueberblick.
const serie = ueberblickBauen([
  zeile({ titel: "Sport", serie_regel: "FREQ=WEEKLY;BYDAY=TU",
          beginn: std("2026-01-06", 18), ende: std("2026-01-06", 19) }),
], TAG);
pruefe("laufende Serie taucht am richtigen Tag auf", serie.text, "18:00  Sport");
pruefe("und nicht an einem anderen", ueberblickBauen([
  zeile({ titel: "Sport", serie_regel: "FREQ=WEEKLY;BYDAY=TU",
          beginn: std("2026-01-06", 18), ende: std("2026-01-06", 19) }),
], "2026-09-16"), null);

console.log(fehler === 0 ? "\nAlle Prüfungen bestanden.\n" : `\n${fehler} Prüfung(en) fehlgeschlagen.\n`);
process.exit(fehler === 0 ? 0 : 1);

