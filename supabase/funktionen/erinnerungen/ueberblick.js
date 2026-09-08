// Baut den Text der Morgenmeldung.
//
// Eigene Datei, damit pruefungen.mjs genau die Fassung prueft, die auch
// laeuft. In index.ts eingebaut waere sie von Node aus nicht erreichbar.

import { vorkommen } from "./serie.js";
import { uhrzeit } from "./zeit.js";
import { feiertagAn, ferienAn } from "./feiertage.js";

// Mehr passt weder in eine Meldung noch auf einen Sperrbildschirm.
export const HOECHSTENS = 6;

// Ohne Titel kommt ein Termin zurueck, den man nur als belegt sehen darf.
const VERDECKT_TITEL = "Belegt";

// Rueckgabe null heisst: nichts zu melden - dann bleibt das Handy still,
// statt jeden Morgen "heute nichts" zu sagen.
export function ueberblickBauen(zeilen, tag) {
  const heutige = [];
  for (const termin of zeilen ?? []) {
    // Verdeckte Termine kommen ohne Titel. Sie ganz wegzulassen waere
    // falsch: dass die Zeit belegt ist, darf man ja wissen.
    if (termin.verdeckt) termin.titel = VERDECKT_TITEL;
    for (const v of vorkommen(termin, tag, tag)) heutige.push(v);
  }

  heutige.sort((x, y) => {
    if (x.termin.ganztags !== y.termin.ganztags) return x.termin.ganztags ? -1 : 1;
    return x.beginn.getTime() - y.beginn.getTime();
  });

  const anlass = feiertagAn(tag) ?? ferienAn(tag)?.name ?? null;
  if (!heutige.length && !anlass) return null;

  const zeilenText = [];
  if (anlass) zeilenText.push(anlass);

  for (const v of heutige.slice(0, HOECHSTENS)) {
    const wann = v.termin.ganztags ? "ganztägig" : uhrzeit(v.beginn);
    zeilenText.push(`${wann}  ${v.termin.titel ?? "Termin"}`);
  }
  const rest = heutige.length - HOECHSTENS;
  if (rest > 0) zeilenText.push(`… und ${rest} weitere`);

  const titel = heutige.length === 0
    ? "Heute: keine Termine"
    : heutige.length === 1
      ? "Heute: 1 Termin"
      : `Heute: ${heutige.length} Termine`;

  return { titel, text: zeilenText.join("\n") };
}
