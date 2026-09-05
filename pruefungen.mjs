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

console.log(fehler === 0 ? "\nAlle Prüfungen bestanden.\n" : `\n${fehler} Prüfung(en) fehlgeschlagen.\n`);
process.exit(fehler === 0 ? 0 : 1);

